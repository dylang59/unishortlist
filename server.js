// Local UCAS course search proxy.
//
// Talks to the Algolia index that powers the UCAS "courses-beta" site
// (d10prod_courses_profile). The credentials below are the public,
// search-only pair the UCAS frontend ships to every browser visitor — they
// are not secret and grant nothing beyond querying the same public index.
//
// This replaced an earlier implementation against services.ucas.com, which
// turned out to be a stale dataset: it reported 6 UCL undergraduate courses
// for 2025 where the live index has 404, and had no 2027 cycle at all.
const http = require('http');
const fs = require('fs');
const path = require('path');
const exporter = require('./export');

const PORT = process.env.PORT || 8787;

const ALGOLIA_APP = process.env.ALGOLIA_APP || 'Y3QRV216KL';
const ALGOLIA_KEY = process.env.ALGOLIA_KEY || 'c0f72e5c62250ac258c2cf4a3896c19d';
const INDEX = process.env.UCAS_INDEX || 'd10prod_courses_profile';

// The index stores one record per course option, and by default collapses
// them with Algolia's distinct feature — which makes nbHits a course count,
// not a row count. We want every option, so distinct is switched off.
const PAGE_SIZE = 100; // hitsPerPage ceiling for this index

// Every query costs UCAS an Algolia search operation, and a single "fetch
// 1,000" click fans out to ten of them. Course data changes on the order of
// days, so an in-process cache keeps repeat browsing — re-sorting, flipping
// back to a previous filter, reloading the page — completely free.
const CACHE_TTL_MS = Number(process.env.CACHE_TTL_MS || 30 * 60 * 1000);
const CACHE_MAX = 500;
const cache = new Map(); // params -> { at, data }
let hits = 0, misses = 0;

function cacheGet(key) {
  const e = cache.get(key);
  if (!e) return null;
  if (Date.now() - e.at > CACHE_TTL_MS) { cache.delete(key); return null; }
  // Refresh recency for the LRU eviction below.
  cache.delete(key); cache.set(key, e);
  return e.data;
}

function cacheSet(key, data) {
  cache.set(key, { at: Date.now(), data: data });
  while (cache.size > CACHE_MAX) cache.delete(cache.keys().next().value);
}

// Collapse identical in-flight requests so a burst of parallel page fetches
// for the same params only goes out once.
const inflight = new Map();

function algolia(params) {
  const cached = cacheGet(params);
  if (cached) { hits++; return Promise.resolve(cached); }

  const pending = inflight.get(params);
  if (pending) return pending;

  misses++;
  const p = fetch(`https://${ALGOLIA_APP}-dsn.algolia.net/1/indexes/${INDEX}/query`, {
    method: 'POST',
    headers: {
      'X-Algolia-API-Key': ALGOLIA_KEY,
      'X-Algolia-Application-Id': ALGOLIA_APP,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ params: params }),
  }).then(async res => {
    const data = await res.json();
    if (data.message) throw new Error('Algolia: ' + data.message);
    cacheSet(params, data);
    return data;
  }).finally(() => inflight.delete(params));

  inflight.set(params, p);
  return p;
}

// The previous-generation index. Its records are shaped differently
// (university/scheme/academicYear instead of provider.name/studyLevel/
// academicYearId) and it only holds 2023-2025, but it carries per-
// qualification entry grades that the current index does not expose.
const LEGACY_INDEX = process.env.UCAS_LEGACY_INDEX || 'prod_courses';

function legacy(params) {
  const key = 'legacy:' + params;
  const cached = cacheGet(key);
  if (cached) { hits++; return Promise.resolve(cached); }
  const pending = inflight.get(key);
  if (pending) return pending;

  misses++;
  const p = fetch(`https://${ALGOLIA_APP}-dsn.algolia.net/1/indexes/${LEGACY_INDEX}/query`, {
    method: 'POST',
    headers: {
      'X-Algolia-API-Key': ALGOLIA_KEY,
      'X-Algolia-Application-Id': ALGOLIA_APP,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ params: params }),
  }).then(async res => {
    const data = await res.json();
    if (data.message) throw new Error('Algolia: ' + data.message);
    cacheSet(key, data);
    return data;
  }).finally(() => inflight.delete(key));

  inflight.set(key, p);
  return p;
}

// Build an Algolia params string. facetFilters is an array of arrays:
// the outer array is ANDed, each inner array is ORed.
function buildParams(q, extra) {
  const and = [];
  if (q.academicYearId) and.push(['academicYearId:' + q.academicYearId]);
  if (q.studyLevel) and.push(['studyLevel:' + q.studyLevel]);
  if (q.providers && q.providers.length) {
    and.push(q.providers.map(p => 'provider.name:' + p));
  }
  if (q.qualificationLevels && q.qualificationLevels.length) {
    and.push(q.qualificationLevels.map(v => 'outcomeQualification.qualificationLevel:' + v));
  }
  if (q.studyModes && q.studyModes.length) {
    and.push(q.studyModes.map(v => 'courseOptions.studyMode.mappedCaption:' + v));
  }
  if (q.regions && q.regions.length) {
    and.push(q.regions.map(v => 'courseOptions.location.region.grouped:' + v));
  }

  const parts = [];
  parts.push('query=' + encodeURIComponent(q.searchTerm || ''));
  parts.push('distinct=0');
  if (and.length) parts.push('facetFilters=' + encodeURIComponent(JSON.stringify(and)));
  if (extra) parts.push(extra);
  return parts.join('&');
}

// UCAS course URLs carry a slug of the title after the id:
//   /explore/courses/<id>/history-politics-and-economics?studyYear=2027
// The index has no slug field, so derive it — lowercase, non-alphanumerics
// collapsed to single hyphens. Verified against a known live URL.
// The id is what actually resolves the course, so a slug that drifts from
// theirs is cosmetic rather than a broken link.
function slugify(title) {
  return String(title || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

// Flatten one Algolia hit (a course + one option) into a compact row.
function flatten(hit) {
  const opt = (hit.courseOptions && hit.courseOptions[0]) || {};
  const prov = hit.provider || {};
  const loc = opt.location || {};
  const start = opt.startDate || {};
  const tariff = hit.ucasTariff || {};

  // The index gives tariff as a min/max pair; 0/0 means "not specified".
  let tariffText = null;
  if (tariff.min || tariff.max) {
    tariffText = tariff.min === tariff.max
      ? String(tariff.min) + ' points'
      : tariff.min + ' - ' + tariff.max + ' points';
  }

  const reqs = (opt.academicEntryRequirements || []).map(r => ({
    qualificationName: r.qualificationName || r.name || '',
    offer: (r.summary && r.summary.offer) || r.offer || r.grades || '',
  })).filter(r => r.offer);

  const geo = (hit._geoloc && hit._geoloc[0]) || {};

  return {
    id: hit.courseId,
    optionId: opt.courseOptionId || null,
    profileId: hit.courseProfileId || null,
    year: hit.academicYearId,
    title: hit.courseTitle,
    provider: prov.name,
    providerSort: prov.sortName || prov.name,
    logo: null,
    applicationCode: opt.applicationCode || null,
    scheme: hit.scheme,
    studyLevel: hit.studyLevel,
    award: (opt.outcomeQualification && opt.outcomeQualification.name)
        || (hit.outcomeQualification && hit.outcomeQualification.name) || null,
    awardFull: (opt.outcomeQualification && opt.outcomeQualification.fullName) || null,
    awardGroup: (opt.outcomeQualification && opt.outcomeQualification.qualificationLevel) || null,
    studyMode: (opt.studyMode && (opt.studyMode.mappedCaption || opt.studyMode.caption)) || null,
    duration: (opt.duration && opt.duration.caption) || null,
    start: start.month && start.year ? start.month + ' ' + start.year : null,
    town: loc.townOrCity || prov.townOrCity || null,
    region: (loc.region && (loc.region.grouped || loc.region.original)) || null,
    country: (loc.country && (loc.country.grouped || loc.country.original)) || null,
    postcode: loc.postcode || prov.postcode || null,
    lat: geo.lat != null ? geo.lat : null,
    lng: geo.lng != null ? geo.lng : null,
    tariff: tariffText,
    tariffMin: tariff.min || null,
    tariffMax: tariff.max || null,
    entryPoints: (opt.entryPoints || []).map(e => e.name).filter(Boolean),
    entryRequirements: reqs,
    // searchSubjectsList is a flat keyword blob, not a list. Keep the text for
    // filtering, and expose a short deduped array for the tag chips.
    subjectText: typeof hit.searchSubjectsList === 'string' ? hit.searchSubjectsList : '',
    subjects: Array.isArray(hit.searchSubjects)
      ? hit.searchSubjects.map(s => (s && s.name) || s).filter(Boolean)
      : [],
    summary: '',
    courseUrl: null,
    ucasUrl: 'https://www.ucas.com/explore/courses/' + hit.courseId
           + (slugify(hit.courseTitle) ? '/' + slugify(hit.courseTitle) : '')
           + '?studyYear=' + (hit.academicYearId || ''),
    providerWebsite: prov.url || null,
    vacancies: hit.vacancies || [],
    optionCount: (hit.courseOptions || []).length,
  };
}

function facetsFrom(data) {
  const f = data.facets || {};
  return {
    providers: f['provider.name'] || {},
    qualifications: f['outcomeQualification.qualificationLevel'] || {},
    studyModes: f['courseOptions.studyMode.mappedCaption'] || {},
    regions: f['courseOptions.location.region.grouped'] || {},
    years: f['academicYearId'] || {},
    levels: f['studyLevel'] || {},
  };
}

const FACET_LIST = JSON.stringify([
  'provider.name',
  'outcomeQualification.qualificationLevel',
  'courseOptions.studyMode.mappedCaption',
  'courseOptions.location.region.grouped',
  'academicYearId',
  'studyLevel',
]);

const routes = {
  // One page of results plus facet counts.
  '/api/search': async (payload) => {
    const page = Math.max(0, (payload.pageNumber || 1) - 1);
    const params = buildParams(payload,
      'hitsPerPage=' + PAGE_SIZE + '&page=' + page +
      '&maxValuesPerFacet=500&facets=' + encodeURIComponent(FACET_LIST));
    const data = await algolia(params);
    return {
      total: data.nbHits,
      pageNumber: page + 1,
      pageSize: PAGE_SIZE,
      totalPages: data.nbPages,
      courses: (data.hits || []).map(flatten),
      facets: facetsFrom(data),
    };
  },

  // Several pages at once, so the table has a real result set to sort over.
  // Unlike the old backend, this index paginates properly — no sharding.
  '/api/bulk': async (payload) => {
    const want = Math.min(payload.limit || 1000, 5000);
    const pages = Math.ceil(want / PAGE_SIZE);

    const firstParams = buildParams(payload,
      'hitsPerPage=' + PAGE_SIZE + '&page=0' +
      '&maxValuesPerFacet=500&facets=' + encodeURIComponent(FACET_LIST));
    const first = await algolia(firstParams);

    const out = (first.hits || []).map(flatten);
    const total = first.nbHits;
    const last = Math.min(pages, first.nbPages);

    // Algolia is fast and rate-limits generously; a small batch keeps it quick
    // without hammering it.
    const CONC = 4;
    const rest = [];
    for (let p = 1; p < last; p++) rest.push(p);
    for (let i = 0; i < rest.length; i += CONC) {
      const batch = rest.slice(i, i + CONC);
      const res = await Promise.all(batch.map(async p => {
        try {
          return await algolia(buildParams(payload, 'hitsPerPage=' + PAGE_SIZE + '&page=' + p));
        } catch (e) { return null; }
      }));
      for (const d of res) if (d && d.hits) out.push(...d.hits.map(flatten));
    }

    return {
      total: total,
      fetched: out.length,
      truncated: out.length < total,
      courses: out,
      facets: facetsFrom(first),
    };
  },

  // Provider list for the picker. Facet values are exactly what the
  // provider.name filter matches, so no alias translation is needed here.
  '/api/providers': async (payload) => {
    const params = buildParams(payload,
      'hitsPerPage=0&maxValuesPerFacet=1000&facets=' +
      encodeURIComponent(JSON.stringify(['provider.name'])));
    const data = await algolia(params);
    const f = (data.facets && data.facets['provider.name']) || {};
    const list = Object.entries(f)
      .map(([name, count]) => ({ name: name, value: name, count: count }))
      .sort((a, b) => a.name.localeCompare(b.name));
    return { providers: list };
  },

  // Last year's entry requirements for this year's courses.
  //
  // A new cycle carries no tariff data for months — universities publish the
  // course long before they finalise grades — so the Tariff column is empty
  // for 2027. courseId is stable across cycles, so the previous year's row
  // for the same course is a good stand-in, clearly labelled as such.
  '/api/tariffs': async (payload) => {
    const year = String(payload.academicYearId || '');
    const prev = String(Number(year) - 1);
    if (!year || Number.isNaN(Number(year))) return { year: null, tariffs: {} };

    // Ask only for the providers actually on screen, so this costs a handful
    // of queries rather than a crawl of the whole previous cycle.
    const providers = (payload.providers || []).slice(0, 40);
    if (!providers.length) return { year: prev, tariffs: {} };

    const byId = {};
    const byTitle = {};
    const CONC = 4;
    // Some universities — UCL, Oxford, Cambridge and most of the selective
    // ones — never quote UCAS tariff points; they publish A-level grades
    // ("AAB") instead, so ucasTariff is 0/0 for every course they list. The
    // legacy index still carries those grades, so it is used as a second
    // source below. Without it these providers show a permanently empty
    // column, which reads as a bug rather than as "not applicable".
    for (let i = 0; i < providers.length; i += CONC) {
      const batch = providers.slice(i, i + CONC);
      await Promise.all(batch.map(async name => {
        try {
          const q = { academicYearId: prev, studyLevel: payload.studyLevel || 'Undergraduate',
                      providers: [name] };
          // Walk up to the 1,000-hit retrievable cap; a provider with more
          // than that just contributes its first 1,000, which is plenty for
          // a lookup table.
          const first = await algolia(buildParams(q, 'hitsPerPage=100&page=0'));
          const hits = (first.hits || []).slice();
          const pages = Math.min(first.nbPages, 10);
          for (let p = 1; p < pages; p++) {
            const d = await algolia(buildParams(q, 'hitsPerPage=100&page=' + p));
            hits.push(...(d.hits || []));
          }
          for (const h of hits) {
            const t = h.ucasTariff;
            if (!t || (!t.min && !t.max)) continue;
            const text = t.min === t.max ? String(t.min) + ' points'
                                         : t.min + ' - ' + t.max + ' points';
            if (h.courseId && !byId[h.courseId]) byId[h.courseId] = text;
            const k = (h.provider && h.provider.name) + '|' +
                      String(h.courseTitle || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
            if (!byTitle[k]) byTitle[k] = text;
          }
        } catch (e) { /* a missing provider just means no fallback for it */ }
      }));
    }
    // Second source: the legacy index, for providers the current one gave us
    // nothing for. It holds 2024/2025 rows carrying A-level grades in
    // entryReq_al, which is what the selective universities actually publish.
    const covered = new Set();
    for (const k of Object.keys(byTitle)) covered.add(k.split('|')[0]);
    const missing = providers.filter(p => !covered.has(p));

    const grades = {};
    const gradesByTitle = {};
    for (let i = 0; i < missing.length; i += CONC) {
      const batch = missing.slice(i, i + CONC);
      await Promise.all(batch.map(async name => {
        try {
          const ff = encodeURIComponent(JSON.stringify([
            ['university:' + name], ['scheme:' + (payload.studyLevel || 'Undergraduate')],
          ]));
          // A provider can have several hundred legacy rows across years, so
          // page through them rather than taking only the first batch.
          const first = await legacy('hitsPerPage=200&page=0&facetFilters=' + ff);
          const all = (first.hits || []).slice();
          const pages = Math.min(first.nbPages || 1, 5);
          for (let p = 1; p < pages; p++) {
            const more = await legacy('hitsPerPage=200&page=' + p + '&facetFilters=' + ff);
            all.push(...(more.hits || []));
          }
          // Prefer the most recent year when the same course appears twice.
          all.sort((a, b) => String(b.academicYear || '').localeCompare(String(a.academicYear || '')));
          for (const h of all) {
            const o = (h.options && h.options[0]) || {};
            const al = o.entryReq_al;
            if (!al || al === 'N/A' || !String(al).trim()) continue;
            const text = String(al).trim();
            if (h.courseId && !grades[h.courseId]) grades[h.courseId] = text;
            const k = (h.university || '') + '|' +
                      String(h.courseTitle || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
            if (!gradesByTitle[k]) gradesByTitle[k] = text;
          }
        } catch (e) { /* legacy index may not have this provider */ }
      }));
    }

    return {
      year: prev, tariffs: byId, byTitle: byTitle,
      grades: grades, gradesByTitle: gradesByTitle,
      gradesFrom: 'recent years',
    };
  },

  // What an export would cost, before committing to it. One query.
  '/api/export/plan': async (payload) => {
    const opts = {
      year: payload.academicYearId,
      level: payload.studyLevel,
      query: payload.searchTerm,
    };
    const info = await exporter.listProviders(opts);
    let list = info.providers;
    if (payload.providers && payload.providers.length) {
      const want = payload.providers.map(s => String(s).toLowerCase());
      list = list.filter(p => want.some(w => p.name.toLowerCase() === w));
    }
    const rows = list.reduce((s, p) => s + p.count, 0);
    return {
      providers: list.length,
      rows: rows,
      queries: list.reduce((s, p) => s + Math.ceil(p.count / 100), 0) + 1,
      largest: list.slice(0, 5),
    };
  },

  // How many upstream queries this session has actually cost.
  '/api/stats': async () => ({
    upstreamQueries: misses,
    servedFromCache: hits,
    cacheEntries: cache.size,
    ttlMinutes: Math.round(CACHE_TTL_MS / 60000),
  }),

  // Raw facet counts, for populating filter controls.
  '/api/facets': async (payload) => {
    const params = buildParams(payload,
      'hitsPerPage=0&maxValuesPerFacet=1000&facets=' + encodeURIComponent(FACET_LIST));
    const data = await algolia(params);
    return { counts: data.facets || {}, total: data.nbHits };
  },
};

// Exports are written here and served back as a download link, so a large
// pull never has to travel through the page as one giant response.
const EXPORT_DIR = path.join(__dirname, 'exports');

// Streaming export. Emits newline-delimited progress events as it goes, so a
// multi-minute pull shows real progress instead of hanging.
async function runExportStream(req, res, payload) {
  res.writeHead(200, {
    'Content-Type': 'application/x-ndjson',
    'Cache-Control': 'no-cache',
    'X-Accel-Buffering': 'no',
  });
  const send = ev => res.write(JSON.stringify(ev) + '\n');

  try {
    if (!fs.existsSync(EXPORT_DIR)) fs.mkdirSync(EXPORT_DIR, { recursive: true });
    const opts = {
      year: payload.academicYearId,
      level: payload.studyLevel,
      query: payload.searchTerm,
      providers: payload.providers,
      pauseMs: 120,
      exact: true,
    };
    const result = await exporter.runExport(opts, ev => {
      if (ev.phase === 'progress' || ev.phase === 'warn') send(ev);
    });

    const csv = payload.format === 'csv';
    const stamp = new Date().toISOString().slice(0, 10);
    const file = 'ucas-' + (opts.year || 'all') + '-' +
                 String(opts.level || 'all').toLowerCase() + '-' + stamp +
                 (csv ? '.csv' : '.ndjson');
    const full = path.join(EXPORT_DIR, file);

    if (csv) {
      fs.writeFileSync(full, exporter.CSV_COLS.join(',') + '\n' +
        result.rows.map(exporter.toCsvRow).join('\n') + '\n');
    } else {
      fs.writeFileSync(full, result.rows.map(r => JSON.stringify(r)).join('\n') + '\n');
    }

    send({ phase: 'done', rows: result.rows.length, expected: result.expected,
           queries: result.queries, file: file, url: '/exports/' + encodeURIComponent(file) });
  } catch (err) {
    send({ phase: 'error', message: String((err && err.message) || err) });
  }
  res.end();
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost:' + PORT);

  if (url.pathname === '/api/export/run') {
    let raw = '';
    for await (const chunk of req) raw += chunk;
    let payload = {};
    try { payload = raw ? JSON.parse(raw) : {}; } catch (e) {}
    return runExportStream(req, res, payload);
  }

  // Serve finished exports as downloads.
  if (url.pathname.startsWith('/exports/')) {
    const name = path.basename(decodeURIComponent(url.pathname.slice('/exports/'.length)));
    const full = path.join(EXPORT_DIR, name);
    if (!full.startsWith(EXPORT_DIR) || !fs.existsSync(full)) {
      res.writeHead(404); res.end('Not found'); return;
    }
    res.writeHead(200, {
      'Content-Type': name.endsWith('.csv') ? 'text/csv' : 'application/x-ndjson',
      'Content-Disposition': 'attachment; filename="' + name + '"',
    });
    fs.createReadStream(full).pipe(res);
    return;
  }

  if (routes[url.pathname]) {
    let raw = '';
    for await (const chunk of req) raw += chunk;
    let payload = {};
    try { payload = raw ? JSON.parse(raw) : {}; } catch (e) {}
    try {
      const data = await routes[url.pathname](payload);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(data));
    } catch (err) {
      res.writeHead(502, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: String((err && err.message) || err) }));
    }
    return;
  }

  const file = url.pathname === '/' ? 'index.html' : url.pathname.replace(/^\/+/, '');
  const root = path.join(__dirname, 'public');
  const full = path.join(root, file);
  if (!full.startsWith(root)) { res.writeHead(403); res.end(); return; }
  fs.readFile(full, (err, buf) => {
    if (err) { res.writeHead(404); res.end('Not found'); return; }
    const ext = path.extname(full);
    const type = ext === '.html' ? 'text/html; charset=utf-8'
               : ext === '.js' ? 'text/javascript'
               : ext === '.css' ? 'text/css' : 'application/octet-stream';
    res.writeHead(200, { 'Content-Type': type });
    res.end(buf);
  });
});

server.listen(PORT, () => {
  console.log('UCAS search running:  http://localhost:' + PORT);
  console.log('index: ' + INDEX);
});
