// Bulk export of UCAS course data.
//
// Kept separate from the search UI on purpose: pulling a whole cycle is a
// deliberate act with a real cost to UCAS (one Algolia search operation per
// 100 rows), not something a page should do because someone clicked around.
//
// Sharding is not an optimisation here, it is required. Algolia caps this
// index at 1,000 retrievable hits per query (nbPages tops out at 10), so
// paging a 29,750-row result set straight through silently yields 1,000 rows
// and no error. Every export is therefore split by provider — whose facet
// counts sum exactly to the total — and any shard still over the cap is split
// again by qualification level, which is also an exact partition.
const fs = require('fs');
const path = require('path');

const APPID = process.env.ALGOLIA_APP || 'Y3QRV216KL';
const KEY = process.env.ALGOLIA_KEY || 'c0f72e5c62250ac258c2cf4a3896c19d';
const INDEX = process.env.UCAS_INDEX || 'd10prod_courses_profile';

const PAGE = 100;   // hitsPerPage ceiling for this index
const CAP = 1000;   // retrievable hits per query
const sleep = ms => new Promise(r => setTimeout(r, ms));

let queryCount = 0;

async function algolia(params, attempt) {
  attempt = attempt || 0;
  queryCount++;
  const res = await fetch(`https://${APPID}-dsn.algolia.net/1/indexes/${INDEX}/query`, {
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
    return algolia(params, attempt + 1);
  }
  const data = await res.json();
  if (data.message) throw new Error('Algolia: ' + data.message);
  return data;
}

function facetFilters(parts) {
  return encodeURIComponent(JSON.stringify(parts.filter(p => p && p.length)));
}

function baseFilters(opts, extra) {
  const f = [];
  if (opts.year) f.push(['academicYearId:' + opts.year]);
  if (opts.level) f.push(['studyLevel:' + opts.level]);
  for (const e of extra || []) f.push(e);
  return f;
}

function params(opts, extra, tail) {
  const p = [
    'query=' + encodeURIComponent(opts.query || ''),
    'distinct=0',
    'facetFilters=' + facetFilters(baseFilters(opts, extra)),
  ];
  if (tail) p.push(tail);
  return p.join('&');
}

// Drop Algolia's _highlightResult, which is most of the payload and none of
// the information.
function clean(hit) {
  const h = Object.assign({}, hit);
  delete h._highlightResult;
  delete h._snippetResult;
  delete h._distinctSeqID;
  return h;
}

// Walk one shard to exhaustion. Returns rows; throws if the shard is bigger
// than the cap, so the caller can split it further.
async function drainShard(opts, extra, onRow) {
  const first = await algolia(params(opts, extra, 'hitsPerPage=' + PAGE + '&page=0'));
  const total = first.nbHits;
  if (total > CAP) return { overflow: true, total: total };

  let n = 0;
  for (const hit of first.hits || []) { onRow(clean(hit)); n++; }
  const pages = Math.min(first.nbPages, Math.ceil(CAP / PAGE));
  for (let p = 1; p < pages; p++) {
    const d = await algolia(params(opts, extra, 'hitsPerPage=' + PAGE + '&page=' + p));
    for (const hit of d.hits || []) { onRow(clean(hit)); n++; }
    if (opts.pauseMs) await sleep(opts.pauseMs);
  }
  return { overflow: false, total: total, fetched: n };
}

async function listProviders(opts) {
  const d = await algolia(params(opts, [],
    'hitsPerPage=0&maxValuesPerFacet=1000&facets=' +
    encodeURIComponent(JSON.stringify(['provider.name']))));
  const f = (d.facets && d.facets['provider.name']) || {};
  return {
    total: d.nbHits,
    providers: Object.entries(f)
      .map(([name, count]) => ({ name: name, count: count }))
      .sort((a, b) => b.count - a.count),
  };
}

async function qualLevels(opts, provider) {
  const d = await algolia(params(opts, [['provider.name:' + provider]],
    'hitsPerPage=0&maxValuesPerFacet=100&facets=' +
    encodeURIComponent(JSON.stringify(['outcomeQualification.qualificationLevel']))));
  const f = (d.facets && d.facets['outcomeQualification.qualificationLevel']) || {};
  return Object.keys(f);
}

async function runExport(opts, log) {
  // Count queries per run, not for the life of the process — the server
  // imports this module once and reuses it across exports.
  const startedAt = queryCount;
  const info = await listProviders(opts);
  let wanted = info.providers;

  if (opts.providers && opts.providers.length) {
    const want = opts.providers.map(s => s.toLowerCase());
    // The UI sends exact facet values it got from us; the CLI takes whatever
    // the user typed, so it matches on substring for convenience.
    wanted = wanted.filter(p => {
      const n = p.name.toLowerCase();
      return opts.exact ? want.includes(n) : want.some(w => n.includes(w));
    });
  }

  const expected = wanted.reduce((s, p) => s + p.count, 0);
  log({ phase: 'plan', providers: wanted.length, expected: expected,
        estQueries: wanted.reduce((s, p) => s + Math.ceil(p.count / PAGE), 0) + 1 });

  const rows = [];
  const seen = new Set();
  const push = h => {
    const key = h.objectID || (h.courseId + '-' + h.academicYearId);
    if (seen.has(key)) return;
    seen.add(key);
    rows.push(h);
  };

  let done = 0;
  for (const p of wanted) {
    const shard = [['provider.name:' + p.name]];
    let r = await drainShard(opts, shard, push);

    if (r.overflow) {
      // Split by qualification level — an exact partition of the shard.
      const levels = await qualLevels(opts, p.name);
      for (const lvl of levels) {
        const sub = shard.concat([['outcomeQualification.qualificationLevel:' + lvl]]);
        const rr = await drainShard(opts, sub, push);
        if (rr.overflow) {
          log({ phase: 'warn', provider: p.name, level: lvl, total: rr.total,
                message: 'slice still exceeds the 1000-hit cap; truncated' });
          await drainShard(opts, sub.concat([['courseOptions.studyMode.mappedCaption:Full-time']]), push);
        }
      }
    }

    done++;
    log({ phase: 'progress', provider: p.name, expected: p.count,
          done: done, of: wanted.length, rows: rows.length, queries: queryCount - startedAt });
    if (opts.pauseMs) await sleep(opts.pauseMs);
  }

  return { rows: rows, expected: expected, queries: queryCount - startedAt };
}

// ---- CLI -------------------------------------------------------------------

function parseArgs(argv) {
  const o = { year: '2027', level: 'Undergraduate', pauseMs: 120, format: 'ndjson' };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const next = () => argv[++i];
    if (a === '--year') o.year = next();
    else if (a === '--level') o.level = next();
    else if (a === '--query') o.query = next();
    else if (a === '--providers') o.providers = next().split(',').map(s => s.trim()).filter(Boolean);
    else if (a === '--out') o.out = next();
    else if (a === '--format') o.format = next();
    else if (a === '--pause') o.pauseMs = Number(next());
    else if (a === '--dry-run') o.dryRun = true;
  }
  return o;
}

// UCAS course URLs put a slug of the title after the id. The index has no
// slug field, so derive it; the id is what resolves the course, so the slug
// is cosmetic.
function slugify(title) {
  return String(title || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

function courseUrl(h) {
  const s = slugify(h.courseTitle);
  return 'https://www.ucas.com/explore/courses/' + h.courseId +
         (s ? '/' + s : '') + '?studyYear=' + (h.academicYearId || '');
}

const CSV_COLS = ['courseId','academicYearId','courseTitle','provider','townOrCity','region',
                  'award','qualificationLevel','studyMode','duration','startDate',
                  'applicationCode','tariffMin','tariffMax','url'];

function toCsvRow(h) {
  const opt = (h.courseOptions && h.courseOptions[0]) || {};
  const prov = h.provider || {};
  const loc = opt.location || {};
  const t = h.ucasTariff || {};
  const vals = [
    h.courseId, h.academicYearId, h.courseTitle, prov.name,
    loc.townOrCity || prov.townOrCity || '',
    (loc.region && (loc.region.grouped || loc.region.original)) || '',
    (opt.outcomeQualification && opt.outcomeQualification.name) || '',
    (opt.outcomeQualification && opt.outcomeQualification.qualificationLevel) || '',
    (opt.studyMode && (opt.studyMode.mappedCaption || opt.studyMode.caption)) || '',
    (opt.duration && opt.duration.caption) || '',
    opt.startDate ? (opt.startDate.month || '') + ' ' + (opt.startDate.year || '') : '',
    opt.applicationCode || '', t.min || '', t.max || '',
    courseUrl(h),
  ];
  return vals.map(v => '"' + String(v == null ? '' : v).replace(/"/g, '""').replace(/\s+/g, ' ') + '"').join(',');
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));

  if (opts.dryRun) {
    const info = await listProviders(opts);
    let list = info.providers;
    if (opts.providers && opts.providers.length) {
      const want = opts.providers.map(s => s.toLowerCase());
      list = list.filter(p => want.some(w => p.name.toLowerCase().includes(w)));
    }
    const rows = list.reduce((s, p) => s + p.count, 0);
    console.log('Year ' + opts.year + ', ' + opts.level);
    console.log('  providers : ' + list.length);
    console.log('  rows      : ' + rows.toLocaleString());
    console.log('  queries   : ~' + (list.reduce((s, p) => s + Math.ceil(p.count / PAGE), 0) + 1));
    console.log('');
    list.slice(0, 15).forEach(p => console.log('   ' + p.name.slice(0, 44).padEnd(46) + p.count));
    if (list.length > 15) console.log('   … and ' + (list.length - 15) + ' more');
    return;
  }

  const out = opts.out || ('ucas-' + opts.year + '-' + opts.level.toLowerCase() +
                           '.' + (opts.format === 'csv' ? 'csv' : 'ndjson'));

  const res = await runExport(opts, ev => {
    if (ev.phase === 'plan') {
      console.log('Exporting ' + ev.expected.toLocaleString() + ' rows from ' +
                  ev.providers + ' providers (~' + ev.estQueries + ' queries)');
    } else if (ev.phase === 'progress') {
      process.stdout.write('\r  ' + ev.done + '/' + ev.of + ' providers  ' +
        ev.rows.toLocaleString() + ' rows  ' + ev.queries + ' queries   ');
    } else if (ev.phase === 'warn') {
      console.log('\n  warning: ' + ev.message + ' (' + ev.provider + ' / ' + ev.level + ')');
    }
  });

  const full = path.resolve(out);
  if (opts.format === 'csv') {
    fs.writeFileSync(full, CSV_COLS.join(',') + '\n' + res.rows.map(toCsvRow).join('\n') + '\n');
  } else {
    fs.writeFileSync(full, res.rows.map(r => JSON.stringify(r)).join('\n') + '\n');
  }

  const size = fs.statSync(full).size;
  console.log('\n\nwrote ' + res.rows.length.toLocaleString() + ' rows -> ' + out +
              '  (' + (size / 1024 / 1024).toFixed(1) + ' MB)');
  console.log('expected ' + res.expected.toLocaleString() +
              (res.rows.length === res.expected ? '  (complete)' : '  (' + (res.expected - res.rows.length) + ' missing)'));
  console.log('upstream queries: ' + res.queries);
}

if (require.main === module) {
  main().catch(e => { console.error('\nfailed:', e.message); process.exit(1); });
}

module.exports = { runExport, listProviders, parseArgs, CSV_COLS, toCsvRow };
