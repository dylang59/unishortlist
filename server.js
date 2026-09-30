// Local UCAS course search proxy.
// Fronts services.ucas.com so the browser avoids CORS, and flattens the
// very verbose UCAS payload into compact rows the UI can render directly.
const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = process.env.PORT || 8787;
const API = 'https://services.ucas.com/search/api/courses/search';
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
           '(KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

const PAGE_SIZE = 10; // UCAS hard-caps page size at 10 regardless of params.

// UCAS rate-limits bursts with 429s, so all upstream traffic goes through one
// small gate: a fixed number of in-flight requests, plus a backoff retry.
const MAX_INFLIGHT = 5;
let inflight = 0;
const waiting = [];

function acquire() {
  if (inflight < MAX_INFLIGHT) { inflight++; return Promise.resolve(); }
  return new Promise(resolve => waiting.push(resolve));
}
function release() {
  const next = waiting.shift();
  if (next) next(); else inflight--;
}

const sleep = ms => new Promise(r => setTimeout(r, ms));

async function ucas(body, attempt) {
  attempt = attempt || 0;
  await acquire();
  let res;
  try {
    res = await fetch(API, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'User-Agent': UA, 'Accept': 'application/json' },
      body: JSON.stringify(body),
    });
  } finally {
    release();
  }
  // Back off and retry on throttling / transient upstream errors.
  if ((res.status === 429 || res.status >= 500) && attempt < 5) {
    const retryAfter = Number(res.headers.get('retry-after'));
    const wait = retryAfter > 0 ? retryAfter * 1000 : Math.min(200 * Math.pow(2, attempt), 4000);
    await sleep(wait + Math.random() * 150);
    return ucas(body, attempt + 1);
  }
  if (!res.ok) throw new Error('UCAS API ' + res.status);
  return res.json();
}

// Pull a named qualification's offer line out of the entry requirements blob.
function gradesFor(opt, name) {
  const quals = opt && opt.academicEntryRequirements
    ? opt.academicEntryRequirements.qualifications || [] : [];
  const q = quals.find(x => new RegExp(name, 'i').test(x.qualificationName || ''));
  return (q && q.summary && q.summary.offer) ? q.summary.offer.trim() : null;
}

function flatten(course) {
  const opts = course.options || [];
  // Prefer a full-time option; otherwise fall back to the first listed.
  const opt = opts.find(o => /full-time/i.test((o.studyMode && o.studyMode.caption) || '')) || opts[0] || {};
  const dur = opt.duration;
  const loc = opt.location;
  const paddr = (course.provider && course.provider.address) || {};
  const laddr = (loc && loc.address) || {};
  return {
    id: course.id,
    year: course.academicYearId,
    title: course.courseTitle,
    provider: course.provider && course.provider.name,
    providerCode: course.provider && course.provider.institutionCode,
    logo: (course.provider && course.provider.logoUrl) || null,
    applicationCode: course.applicationCode,
    scheme: course.routingData && course.routingData.scheme && course.routingData.scheme.caption,
    award: (opt.outcomeQualification && opt.outcomeQualification.caption) || null,
    awardGroup: (opt.outcomeQualification && opt.outcomeQualification.mappedCaption) || null,
    studyMode: (opt.studyMode && opt.studyMode.caption) || null,
    duration: dur ? (dur.quantity + ' ' + ((dur.durationType && dur.durationType.caption) || '')).trim() : null,
    start: (opt.startDate && opt.startDate.date) || null,
    town: laddr.line4 || laddr.line2 || paddr.line2 || null,
    region: (paddr.region && paddr.region.caption) || null,
    country: (paddr.country && paddr.country.caption) || null,
    postcode: laddr.postcode || paddr.postcode || null,
    lat: paddr.latitude != null ? paddr.latitude : null,
    lng: paddr.longitude != null ? paddr.longitude : null,
    tariff: gradesFor(opt, 'UCAS Tariff'),
    aLevel: gradesFor(opt, 'A level'),
    btec: gradesFor(opt, 'BTEC'),
    ib: gradesFor(opt, 'International Baccalaureate'),
    scottishHigher: gradesFor(opt, 'Scottish Higher'),
    subjects: (course.subjects || []).map(s => s.caption).filter(Boolean),
    department: (course.department && course.department.name) || null,
    summary: (course.summary || '').replace(/\*\*/g, '').trim(),
    entryRequirements: (opt.academicEntryRequirements && opt.academicEntryRequirements.qualifications) || [],
    courseUrl: opt.providerCourseUrl || null,
    applyUrl: opt.providerApplyUrl || null,
    degreeApprenticeship: !!course.degreeApprenticeship,
    ucasUrl: 'https://digital.ucas.com/coursedisplay/courses/' + encodeURIComponent(course.id) + '?academicYearId=' + encodeURIComponent(course.academicYearId || '') + (opt.id ? '&optionId=' + encodeURIComponent(opt.id) : ''),
    optionCount: opts.length,
  };
}

function buildBody(q) {
  const filters = {};
  // Undergraduate vs postgraduate is a DESTINATION, not a scheme. Filtering on
  // schemes: ["UCAS Undergraduate"] looks equivalent but is not — it drops the
  // ~48 providers who list through "Direct application only", which includes
  // Oxford, Cambridge, LSE and Durham (about 3,700 courses).
  if (q.destinations && q.destinations.length) filters.destinations = q.destinations;
  if (q.schemes && q.schemes.length) filters.schemes = q.schemes;
  // Entry year. This is the right way to filter by cycle: it must be a plain
  // STRING ("2027"), not an array — an array is rejected as a bad request,
  // and the plural spellings (academicYears, studyYear) are silently ignored
  // and return the unfiltered set. Filtering on startDates instead is wrong:
  // it matches mid-year intakes from the *previous* cycle.
  if (q.academicYearId) filters.academicYearId = String(q.academicYearId);
  if (q.startDates && q.startDates.length) filters.startDates = q.startDates;
  if (q.subjects && q.subjects.length) filters.subjects = q.subjects;
  if (q.providers && q.providers.length) filters.providers = q.providers;
  if (q.qualifications && q.qualifications.length) filters.qualifications = q.qualifications;
  if (q.attendanceTypes && q.attendanceTypes.length) filters.attendanceTypes = q.attendanceTypes;
  if (q.degreeApprenticeship === true) filters.degreeApprenticeship = ['true'];

  const body = { filters: filters, pageNumber: q.pageNumber || 1 };
  if (q.searchTerm) body.searchTerm = q.searchTerm;
  return body;
}

function facetsOf(data) {
  const c = (data.information && data.information.courseCounts) || {};
  return {
    subjects: c.subjects || {},
    providers: c.providers || {},
    qualifications: c.qualifications || {},
    attendanceTypes: c.attendanceTypes || {},
    startDates: c.startDates || {},
    schemes: c.schemes || {},
  };
}

const routes = {
  // Single page of results, with facets.
  '/api/search': async (payload) => {
    const data = await ucas(buildBody(payload));
    const counts = (data.information && data.information.courseCounts) || {};
    const total = counts.totalCourseCount != null ? counts.totalCourseCount : null;
    return {
      total: total,
      pageNumber: payload.pageNumber || 1,
      pageSize: PAGE_SIZE,
      totalPages: total != null ? Math.ceil(total / PAGE_SIZE) : null,
      courses: (data.courses || []).map(flatten),
      facets: facetsOf(data),
    };
  },

  // Breadth fetch.
  //
  // The upstream API ignores pageNumber/pageSize entirely: every request
  // returns the same top 10 rows. The only way to see more of the corpus is
  // to *narrow* the query until each slice fits in 10, so we shard by
  // provider — the provider facet tells us exactly which ones have matches
  // and how many, so we only fetch shards that contain results.
  '/api/bulk': async (payload) => {
    const maxShards = Math.min(payload.pages || 20, 120);
    // Wall-clock budget. Broad searches ("computer science" is ~4k courses)
    // have far more shards than we can fetch under rate limiting, so stop on
    // time and return what we have rather than hanging the request.
    const budgetMs = Math.min(Math.max(payload.budgetMs || 25000, 5000), 90000);
    const deadline = Date.now() + budgetMs;
    const outOfTime = () => Date.now() > deadline;

    // One unsharded call gives us totals plus the provider facet histogram.
    const first = await ucas(buildBody(payload));
    const counts = (first && first.information && first.information.courseCounts) || {};
    const total = counts.totalCourseCount != null ? counts.totalCourseCount : null;

    const out = [];
    const seen = new Set();
    // Rows collected per provider, so a shard can tell when it is complete
    // and stop spending requests. Keyed by both display and alias name, since
    // shards are addressed by alias but rows carry the display name.
    const perProvider = new Map();
    const bump = (name) => {
      if (!name) return;
      perProvider.set(name, (perProvider.get(name) || 0) + 1);
    };
    const countFor = (name) => perProvider.get(name) || 0;

    const add = (cs) => {
      for (const c of cs || []) {
        const key = c.compositeId || c.id;
        if (seen.has(key)) continue;
        seen.add(key);
        out.push(flatten(c));
        const p = c.provider || {};
        bump(p.name);
        if (p.aliasName && p.aliasName !== p.name) bump(p.aliasName);
      }
    };
    add(first.courses);

    // Providers with the most matches first, so a capped run still covers
    // the biggest chunks of the result set.
    // Shard by provider. Note the `providers` FILTER matches a provider's
    // alias name ("Swansea University (Abertawe)"), not its display name, so
    // shard keys must come from the providerAliases facet — using the plain
    // providers facet silently returns nothing for any renamed institution.
    // Counts sum to the total, so biggest-first keeps a capped run useful.
    const aliasFacet = counts.providerAliases && Object.keys(counts.providerAliases).length
      ? counts.providerAliases : counts.providers;
    const providers = Object.entries(aliasFacet || {})
      .filter(([, n]) => n > 0)
      .sort((a, b) => b[1] - a[1])
      .slice(0, maxShards)
      .map(([name]) => name);

    const CONC = 8; // batch width; real pacing is enforced by the ucas() gate
    const deep = []; // provider shards that still overflowed the 10-row cap

    for (let i = 0; i < providers.length; i += CONC) {
      if (outOfTime()) break;
      const batch = providers.slice(i, i + CONC);
      const res = await Promise.all(batch.map(async name => {
        const q = Object.assign({}, payload, { providers: [name] });
        try { return { name: name, data: await ucas(buildBody(q)) }; }
        catch (e) { return null; }
      }));
      for (const r of res) {
        if (!r || !r.data) continue;
        add(r.data.courses);
        const c = (r.data.information && r.data.information.courseCounts) || {};
        const n = c.totalCourseCount;
        // Still capped: keep its facets so we can partition it further.
        if (n != null && n > 10) {
          deep.push({ name: r.name, total: n, quals: c.qualifications || {}, subjects: c.subjects || {} });
        }
      }
    }

    // Second pass: split each overflowing provider.
    //
    // Subjects are NOT a partition — one course carries several subject tags,
    // so those facet counts overlap and splitting on them leaves gaps.
    // Qualification and attendance type are true partitions (their counts sum
    // to the provider total), so split on those first, and only then fall back
    // to subjects to chip away at whatever is still capped.
    for (let i = 0; i < deep.length; i += CONC) {
      if (outOfTime()) break;
      const batch = deep.slice(i, i + CONC);
      await Promise.all(batch.map(async p => {
        const base = Object.assign({}, payload, { providers: [p.name] });

        const quals = Object.entries(p.quals || {}).filter(([, n]) => n > 0).map(([q]) => q);

        // Qualification alone is a clean partition, so start there.
        const overflow = [];
        for (const qual of quals) {
          if (outOfTime()) break;
          if (p.total && countFor(p.name) >= p.total) break; // provider already complete
          const q = Object.assign({}, base, { qualifications: [qual] });
          let d = null;
          try { d = await ucas(buildBody(q)); } catch (e) { continue; }
          add(d.courses);
          const cc2 = (d.information && d.information.courseCounts) || {};
          if ((cc2.totalCourseCount || 0) > 10) overflow.push({ qual: qual, cc: cc2 });
        }

        // Anything still capped gets crossed with subjects. Subjects overlap,
        // so this is not a true partition, but each combination is a narrower
        // slice and can only reveal rows we have not already collected.
        // Stop as soon as the slice is fully accounted for, since every extra
        // request costs rate-limit budget for no new rows.
        for (const o of overflow) {
          const want = o.cc.totalCourseCount || 0;
          let have = countFor(p.name);
          if (have >= want) continue;

          const subs = Object.entries(o.cc.subjects || {})
            .filter(([, n]) => n > 0)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 20)
            .map(([s]) => s);

          for (const s of subs) {
            if (outOfTime()) break;
            const q = Object.assign({}, base, { qualifications: [o.qual], subjects: [s] });
            try { const d = await ucas(buildBody(q)); add(d.courses); } catch (e) { continue; }
            have = countFor(p.name);
            if (have >= want) break;
          }
        }
      }));
    }

    return {
      total: total,
      fetched: out.length,
      shards: providers.length,
      deepShards: deep.length,
      timedOut: outOfTime(),
      truncated: total != null && out.length < total,
      courses: out,
      facets: facetsOf(first),
    };
  },

  // Facet vocabulary for populating filter controls.
  '/api/facets': async (payload) => {
    const data = await ucas(buildBody(payload || {}));
    return { counts: (data.information && data.information.courseCounts) || {} };
  },

  // The provider picker list.
  //
  // Two facets matter here: `providers` holds display names and
  // `providerAliases` holds the values the `providers` FILTER actually
  // matches. They are parallel — same length, same order, same counts — so
  // they pair by index. The alias usually also carries the abbreviation
  // ("Manchester Metropolitan University (MMU)"), which makes it good search
  // text: typing "MMU" or "LSBU" finds the right institution.
  '/api/providers': async (payload) => {
    const data = await ucas(buildBody(payload || {}));
    const cc = (data.information && data.information.courseCounts) || {};
    const names = Object.entries(cc.providers || {});
    const aliases = Object.entries(cc.providerAliases || {});

    const list = names.map((entry, i) => {
      const alias = aliases[i];
      // Only trust the index pairing when the shapes agree; fall back to the
      // display name, which is a valid filter value for most providers.
      const paired = alias && alias[1] === entry[1];
      return {
        name: entry[0],
        value: paired ? alias[0] : entry[0],
        count: entry[1],
      };
    });

    list.sort((a, b) => a.name.localeCompare(b.name));
    return { providers: list };
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

  // Static files.
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
});
