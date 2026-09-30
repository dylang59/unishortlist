// Build a D1-ready SQL file from the Algolia index.
//
// Pulls a cycle with export.js, resolves entry requirements (including the
// A-level grade fallback the selective universities need), and writes batched
// INSERTs. Run the result through `wrangler d1 execute`.
//
// Usage:
//   node import-d1.js --year 2027 --level Undergraduate --out snapshot.sql
//   npx wrangler d1 execute ucas --remote --file=snapshot.sql
const fs = require('fs');
const path = require('path');
const exporter = require('./export');

const APPID = process.env.ALGOLIA_APP || 'Y3QRV216KL';
const KEY = process.env.ALGOLIA_KEY || 'c0f72e5c62250ac258c2cf4a3896c19d';
const INDEX = process.env.UCAS_INDEX || 'd10prod_courses_profile';
const LEGACY = process.env.UCAS_LEGACY_INDEX || 'prod_courses';

const sleep = ms => new Promise(r => setTimeout(r, ms));

async function query(index, params, attempt) {
  attempt = attempt || 0;
  const res = await fetch(`https://${APPID}-dsn.algolia.net/1/indexes/${index}/query`, {
    method: 'POST',
    headers: {
      'X-Algolia-API-Key': KEY,
      'X-Algolia-Application-Id': APPID,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ params: params }),
  });
  if ((res.status === 429 || res.status >= 500) && attempt < 5) {
    await sleep(Math.min(500 * Math.pow(2, attempt), 8000));
    return query(index, params, attempt + 1);
  }
  const d = await res.json();
  if (d.message) throw new Error(d.message);
  return d;
}

const slugify = t => String(t || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
const norm = s => String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

// Previous-cycle tariff points, keyed by courseId and by provider+title.
async function priorTariffs(year, level, providers) {
  const prev = String(Number(year) - 1);
  const byId = {}, byTitle = {};
  let n = 0;
  for (const name of providers) {
    const ff = encodeURIComponent(JSON.stringify([
      ['academicYearId:' + prev], ['studyLevel:' + level], ['provider.name:' + name],
    ]));
    try {
      const first = await query(INDEX, 'hitsPerPage=100&distinct=0&page=0&facetFilters=' + ff);
      const hits = (first.hits || []).slice();
      for (let p = 1; p < Math.min(first.nbPages, 10); p++) {
        const d = await query(INDEX, 'hitsPerPage=100&distinct=0&page=' + p + '&facetFilters=' + ff);
        hits.push(...(d.hits || []));
      }
      for (const h of hits) {
        const t = h.ucasTariff;
        if (!t || (!t.min && !t.max)) continue;
        const text = t.min === t.max ? String(t.min) + ' points' : t.min + ' - ' + t.max + ' points';
        if (h.courseId && !byId[h.courseId]) { byId[h.courseId] = { text: text, min: t.min, max: t.max }; n++; }
        const k = (h.provider && h.provider.name) + '|' + norm(h.courseTitle);
        if (!byTitle[k]) byTitle[k] = { text: text, min: t.min, max: t.max };
      }
    } catch (e) { /* provider absent from the previous cycle */ }
    await sleep(80);
  }
  return { prev: prev, byId: byId, byTitle: byTitle, count: n };
}

// A-level grades from the legacy index, for providers that never quote points.
async function legacyGrades(level, providers) {
  const byId = {}, byTitle = {};
  let n = 0;
  for (const name of providers) {
    const ff = encodeURIComponent(JSON.stringify([['university:' + name], ['scheme:' + level]]));
    try {
      const first = await query(LEGACY, 'hitsPerPage=200&page=0&facetFilters=' + ff);
      const all = (first.hits || []).slice();
      for (let p = 1; p < Math.min(first.nbPages || 1, 5); p++) {
        const d = await query(LEGACY, 'hitsPerPage=200&page=' + p + '&facetFilters=' + ff);
        all.push(...(d.hits || []));
      }
      all.sort((a, b) => String(b.academicYear || '').localeCompare(String(a.academicYear || '')));
      for (const h of all) {
        const o = (h.options && h.options[0]) || {};
        const al = o.entryReq_al;
        if (!al || al === 'N/A' || !String(al).trim()) continue;
        const text = String(al).trim();
        if (h.courseId && !byId[h.courseId]) { byId[h.courseId] = text; n++; }
        const k = (h.university || '') + '|' + norm(h.courseTitle);
        if (!byTitle[k]) byTitle[k] = text;
      }
    } catch (e) { /* not in the legacy index */ }
    await sleep(80);
  }
  return { byId: byId, byTitle: byTitle, count: n };
}

const q = v => v == null || v === '' ? 'NULL' : "'" + String(v).replace(/'/g, "''") + "'";
const num = v => v == null || v === '' || Number.isNaN(Number(v)) ? 'NULL' : Number(v);

function toRow(h, tariffs, grades) {
  const o = (h.courseOptions && h.courseOptions[0]) || {};
  const p = h.provider || {};
  const loc = o.location || {};
  const t = h.ucasTariff || {};
  const geo = (h._geoloc && h._geoloc[0]) || {};
  const key = p.name + '|' + norm(h.courseTitle);

  let tText = null, tMin = t.min || null, tMax = t.max || null, tFrom = null, isGrades = 0;
  if (t.min || t.max) {
    tText = t.min === t.max ? String(t.min) + ' points' : t.min + ' - ' + t.max + ' points';
  } else {
    const prior = tariffs.byId[h.courseId] || tariffs.byTitle[key];
    if (prior) {
      tText = prior.text; tMin = prior.min; tMax = prior.max; tFrom = tariffs.prev;
    } else {
      const g = grades.byId[h.courseId] || grades.byTitle[key];
      if (g) { tText = g; tFrom = 'recent years'; isGrades = 1; }
    }
  }

  const slug = slugify(h.courseTitle);
  return [
    q(h.objectID || (h.courseId + '-' + h.academicYearId)),
    q(h.courseId), q(h.academicYearId), q(h.studyLevel), q(h.courseTitle), q(slug),
    q(p.name), q(p.sortName || p.name),
    q(loc.townOrCity || p.townOrCity),
    q((loc.region && (loc.region.grouped || loc.region.original))),
    q((loc.country && (loc.country.grouped || loc.country.original))),
    q(loc.postcode || p.postcode),
    num(geo.lat), num(geo.lng),
    q((o.outcomeQualification || {}).name),
    q((o.outcomeQualification || {}).fullName),
    q((o.outcomeQualification || {}).qualificationLevel),
    q((o.studyMode || {}).mappedCaption || (o.studyMode || {}).caption),
    q((o.duration || {}).caption),
    q(o.startDate ? (o.startDate.month || '') + ' ' + (o.startDate.year || '') : null),
    q((o.entryPoints || []).map(e => e.name).join(', ')),
    q(o.applicationCode),
    num(tMin), num(tMax), q(tText), q(tFrom), isGrades,
    q(String(h.searchSubjectsList || '').slice(0, 500)),
    q(p.url),
    q('https://www.ucas.com/explore/courses/' + h.courseId + (slug ? '/' + slug : '') +
      '?studyYear=' + (h.academicYearId || '')),
  ].join(',');
}

const COLS = '(rowid_key,course_id,year,level,title,slug,provider,provider_sort,town,region,' +
             'country,postcode,lat,lng,award,award_full,award_level,study_mode,duration,' +
             'start_date,entry_points,app_code,tariff_min,tariff_max,tariff_text,tariff_from,' +
             'tariff_grades,subjects,provider_url,ucas_url)';

async function main() {
  const args = process.argv.slice(2);
  const get = (flag, def) => {
    const i = args.indexOf(flag);
    return i >= 0 ? args[i + 1] : def;
  };
  const year = get('--year', '2027');
  const level = get('--level', 'Undergraduate');
  const out = get('--out', 'snapshot-' + year + '.sql');

  console.log('Pulling ' + year + ' ' + level + ' from Algolia…');
  const res = await exporter.runExport(
    { year: year, level: level, pauseMs: 100 },
    ev => {
      if (ev.phase === 'plan') {
        console.log('  ' + ev.expected.toLocaleString() + ' courses, ' +
                    ev.providers + ' providers, ~' + ev.estQueries + ' queries');
      } else if (ev.phase === 'progress') {
        process.stdout.write('\r  ' + ev.done + '/' + ev.of + ' providers  ' +
                             ev.rows.toLocaleString() + ' rows   ');
      }
    });
  console.log('\n  got ' + res.rows.length.toLocaleString() + ' rows');

  const providers = [...new Set(res.rows.map(h => h.provider && h.provider.name).filter(Boolean))];

  console.log('Resolving entry requirements…');
  const tariffs = await priorTariffs(year, level, providers);
  console.log('  ' + tariffs.count.toLocaleString() + ' tariff points from ' + tariffs.prev);

  // Only the providers still without any tariff need the legacy grade lookup.
  const needGrades = providers.filter(name => {
    const rows = res.rows.filter(h => h.provider && h.provider.name === name);
    return rows.every(h => {
      const t = h.ucasTariff || {};
      if (t.min || t.max) return false;
      const k = name + '|' + norm(h.courseTitle);
      return !tariffs.byId[h.courseId] && !tariffs.byTitle[k];
    });
  });
  console.log('  ' + needGrades.length + ' providers quote grades, not points');
  const grades = await legacyGrades(level, needGrades);
  console.log('  ' + grades.count.toLocaleString() + ' A-level grade entries');

  console.log('Writing SQL…');
  const parts = [];
  parts.push('DELETE FROM courses WHERE year=' + q(year) + ' AND level=' + q(level) + ';');

  // Batch inserts. D1 rejects oversized statements with SQLITE_TOOBIG, and
  // these rows carry long subject blobs, so keep batches small.
  const BATCH = 25;
  for (let i = 0; i < res.rows.length; i += BATCH) {
    const chunk = res.rows.slice(i, i + BATCH);
    const values = chunk.map(h => '(' + toRow(h, tariffs, grades) + ')').join(',\n');
    parts.push('INSERT OR REPLACE INTO courses ' + COLS + ' VALUES\n' + values + ';');
  }

  parts.push("INSERT OR REPLACE INTO meta (key,value) VALUES " +
             "('snapshot_" + year + '_' + level.toLowerCase() + "'," +
             q(new Date().toISOString()) + ");");
  parts.push("INSERT OR REPLACE INTO meta (key,value) VALUES " +
             "('rows_" + year + '_' + level.toLowerCase() + "'," + q(res.rows.length) + ");");

  // Rebuild the search index over the new rows.
  parts.push("INSERT INTO courses_fts(courses_fts) VALUES('rebuild');");

  fs.writeFileSync(out, parts.join('\n') + '\n');
  const size = fs.statSync(out).size;
  const withT = res.rows.filter(h => {
    const t = h.ucasTariff || {};
    if (t.min || t.max) return true;
    const k = (h.provider && h.provider.name) + '|' + norm(h.courseTitle);
    return tariffs.byId[h.courseId] || tariffs.byTitle[k] ||
           grades.byId[h.courseId] || grades.byTitle[k];
  }).length;

  console.log('\nwrote ' + out + '  (' + (size / 1024 / 1024).toFixed(1) + ' MB)');
  console.log('  rows              : ' + res.rows.length.toLocaleString());
  console.log('  with requirements : ' + withT.toLocaleString() +
              '  (' + ((withT / res.rows.length) * 100).toFixed(1) + '%)');
  console.log('  upstream queries  : ' + res.queries);
  console.log('\nNext:');
  console.log('  npx wrangler d1 execute ucas --remote --file=' + out);
}

if (require.main === module) {
  main().catch(e => { console.error('\nfailed:', e.message); process.exit(1); });
}
