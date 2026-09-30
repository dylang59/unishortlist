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

const PORT = process.env.PORT || 8787;

const ALGOLIA_APP = process.env.ALGOLIA_APP || 'Y3QRV216KL';
const ALGOLIA_KEY = process.env.ALGOLIA_KEY || 'c0f72e5c62250ac258c2cf4a3896c19d';
const INDEX = process.env.UCAS_INDEX || 'd10prod_courses_profile';

// The index stores one record per course option, and by default collapses
// them with Algolia's distinct feature — which makes nbHits a course count,
// not a row count. We want every option, so distinct is switched off.
const PAGE_SIZE = 100; // hitsPerPage ceiling for this index

function algolia(params) {
  return fetch(`https://${ALGOLIA_APP}-dsn.algolia.net/1/indexes/${INDEX}/query`, {
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
    return data;
  });
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

  // Raw facet counts, for populating filter controls.
  '/api/facets': async (payload) => {
    const params = buildParams(payload,
      'hitsPerPage=0&maxValuesPerFacet=1000&facets=' + encodeURIComponent(FACET_LIST));
    const data = await algolia(params);
    return { counts: data.facets || {}, total: data.nbHits };
  },
};

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost:' + PORT);

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
