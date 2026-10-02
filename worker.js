// Cloudflare Worker serving the UCAS course snapshot from D1.
//
// Deliberately never calls Algolia: the data is imported ahead of time, so
// browsing this site costs UCAS nothing and the Algolia credentials stay off
// the network entirely. Refresh with import-d1.js when a cycle moves.

const PAGE_MAX = 1000;

function json(data, status) {
  return new Response(JSON.stringify(data), {
    status: status || 200,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'public, max-age=300',
    },
  });
}

// Map a D1 row to the shape the frontend already expects, so the search page
// works against either backend unchanged.
function toCourse(r) {
  return {
    id: r.course_id,
    year: r.year,
    title: r.title,
    provider: r.provider,
    providerSort: r.provider_sort,
    town: r.town,
    region: r.region,
    country: r.country,
    postcode: r.postcode,
    lat: r.lat,
    lng: r.lng,
    award: r.award,
    awardFull: r.award_full,
    awardGroup: r.award_level,
    studyMode: r.study_mode,
    duration: r.duration,
    start: r.start_date,
    entryPoints: r.entry_points ? r.entry_points.split(', ').filter(Boolean) : [],
    applicationCode: r.app_code,
    tariff: r.tariff_text,
    tariffMin: r.tariff_min,
    tariffMax: r.tariff_max,
    tariffFrom: r.tariff_from,
    tariffIsGrades: !!r.tariff_grades,
    subjectText: r.subjects,
    subjects: [],
    entryRequirements: [],
    studyLevel: r.level,
    providerWebsite: r.provider_url,
    ucasUrl: r.ucas_url,
    courseUrl: r.course_url || null,
    courseLink: r.course_link || null,
    kisKey: r.kis_key || null,
    optionCount: 1,
    summary: '',
  };
}

// Build a WHERE clause from the same filter vocabulary the Algolia server used.
// With `match`, the search term is served by the trigram index instead of LIKE
// (see ftsMatch); both select the same rows.
function where(p, match) {
  const sql = [];
  const args = [];
  if (p.academicYearId) { sql.push('year = ?'); args.push(String(p.academicYearId)); }
  if (p.studyLevel) { sql.push('level = ?'); args.push(p.studyLevel); }

  const list = (vals, col) => {
    if (!vals || !vals.length) return;
    sql.push('(' + vals.map(() => col + ' = ?').join(' OR ') + ')');
    args.push(...vals);
  };
  list(p.providers, 'provider');
  list(p.qualificationLevels, 'award_level');
  list(p.studyModes, 'study_mode');
  list(p.regions, 'region');

  if (match) {
    sql.push('rowid IN (SELECT rowid FROM courses_fts WHERE courses_fts MATCH ?)');
    args.push(match);
  } else if (p.searchTerm && p.searchTerm.trim()) {
    // LIKE over title, provider and the subject keyword blob. Fast enough on
    // 30k rows, but it reads all of them.
    const t = '%' + p.searchTerm.trim().toLowerCase() + '%';
    sql.push('(lower(title) LIKE ? OR lower(provider) LIKE ? OR lower(subjects) LIKE ?)');
    args.push(t, t, t);
  }
  return { sql: sql.length ? 'WHERE ' + sql.join(' AND ') : '', args: args };
}

// Whether courses_fts is the trigram index, checked once per isolate. A
// database not yet migrated still carries the token-based one, which would
// quietly drop Astrophysics from a search for physics -- so anything other than
// a confirmed trigram index means LIKE. A failed check is not cached.
let trigram = null;

async function hasTrigram(env) {
  if (trigram === null) {
    const row = await env.DB.prepare(
      "SELECT sql FROM sqlite_master WHERE name = 'courses_fts'"
    ).first().catch(() => undefined);
    if (row === undefined) return false;
    trigram = !!(row && /tokenize\s*=\s*'trigram'/i.test(row.sql));
  }
  return trigram;
}

// The trigram MATCH string for a search, or null where LIKE is the better or
// only choice. LIKE reads the whole cycle to find the matches; the index reads
// ~4 rows per match. Not used when:
// - the term is under 3 characters, which a trigram index cannot match;
// - it holds % or _, which LIKE treats as wildcards, so the two would differ;
// - universities are picked, since LIKE then scans only their rows -- UCL with
//   physics read 454 rows by LIKE and 1,728 by the index.
async function ftsMatch(env, p) {
  const term = p.searchTerm && p.searchTerm.trim();
  if (!term || [...term].length < 3 || /[%_]/.test(term)) return null;
  if ((p.providers || []).filter(Boolean).length) return null;
  if (!(await hasTrigram(env))) return null;
  // A quoted FTS5 string is matched as a substring; quotes inside it double.
  return '"' + term.replace(/"/g, '""') + '"';
}

// The row count for a result set, from the precomputed tables where they can
// answer it. COUNT(*) over `courses` reads the whole filtered set to produce one
// number -- 28,000 rows for an unfiltered search -- and D1 bills rows read.
//
// Every filter except the search term is a column those tables are grouped on,
// and each is an OR over values of one column, so summing the matching rows is
// exactly equivalent. provider_counts (~320 rows a cycle) serves year, level
// and provider; filter_counts (~1,235) adds qualification, mode and region. A
// search term has to be counted live -- by the trigram index when `w` uses it.
//
// One university plus a filter is counted live too: that reads at most the
// university's own rows (1,036 for the largest), which is never more than
// summing filter_counts. UCL with Bach(hons) read 384 rows live, 1,235 summed.
async function countFor(env, p, w) {
  const has = v => v && v.filter(Boolean).length;
  const narrowed = has(p.qualificationLevels) || has(p.studyModes) || has(p.regions);
  const live = (p.searchTerm && p.searchTerm.trim()) || (narrowed && has(p.providers) === 1);
  if (!live && p.academicYearId && p.studyLevel) {
    const cond = [];
    const args = [];
    const list = (vals, col) => {
      vals = (vals || []).filter(Boolean);
      if (!vals.length) return;
      cond.push(col + ' IN (' + vals.map(() => '?').join(',') + ')');
      args.push(...vals);
    };
    list(p.providers, 'provider');
    if (narrowed) {
      list(p.qualificationLevels, 'award_level');
      list(p.studyModes, 'study_mode');
      list(p.regions, 'region');
    }
    // One statement, so an empty table is distinguishable from a filter with
    // no courses: `have` counts the cycle's rows regardless of the filters.
    // Without that, an empty provider_counts made a filtered search report zero
    // courses instead of falling back -- it looked like a working search with no
    // results, which is the worst way for this to fail.
    const sql = 'SELECT SUM(CASE WHEN ' + (cond.length ? cond.join(' AND ') : '1') +
          ' THEN count ELSE 0 END) AS n, COUNT(*) AS have FROM ' +
          (narrowed ? 'filter_counts' : 'provider_counts') + ' WHERE year = ? AND level = ?';
    const row = await env.DB.prepare(sql)
      .bind(...args, String(p.academicYearId), p.studyLevel).first().catch(() => null);
    if (row && row.have) return row.n || 0;
  }
  const countRow = await env.DB.prepare('SELECT COUNT(*) AS n FROM courses ' + w.sql)
    .bind(...w.args).first();
  return countRow ? countRow.n : 0;
}

// Roughly the rows in a cycle, for choosing how to fetch a search's rows below.
// Only the order of magnitude matters: both ways return the same rows.
const CYCLE_ROWS = 30000;

async function handleSearch(env, p) {
  const match = await ftsMatch(env, p);
  const w = where(p, match);
  const limit = Math.min(Number(p.limit) || 300, PAGE_MAX);

  const total = await countFor(env, p, w);

  // The count says which way to fetch the rows is cheaper. The trigram index
  // reads ~4 rows per match, all of them before it can sort. LIKE walks
  // idx_sort in order and stops at `limit` matches, so it reads about
  // limit * CYCLE_ROWS / total: 2,430 rows for business (3,817 matches) against
  // 15,268 by the index, but 12,000 for physics (848) against 3,392. They cross
  // where total^2 = limit * CYCLE_ROWS / 4 -- about 1,500 matches at 300.
  const rw = match && total * total * 4 > limit * CYCLE_ROWS ? where(p) : w;

  // With a shortlist of universities, a plain alphabetical LIMIT can cut the
  // last ones off entirely — UCL sorts last, so it looked like it had no
  // courses. Interleave instead: take a fair share from each selected
  // provider so every one of them is represented.
  const picked = (p.providers || []).filter(Boolean);
  // rowid_key breaks ties: 2,383 rows share a (provider_sort, title) with
  // another -- the same course at a different study mode or start date -- and
  // without it their relative order is undefined, so a row can move between
  // identical requests.
  const sql = picked.length > 1
    ? 'SELECT * FROM (SELECT *, ROW_NUMBER() OVER (PARTITION BY provider ORDER BY title) AS rn ' +
      'FROM courses ' + rw.sql + ') ORDER BY rn, provider_sort, title, rowid_key LIMIT ?'
    : 'SELECT * FROM courses ' + rw.sql + ' ORDER BY provider_sort, title, rowid_key LIMIT ?';

  const rows = await env.DB.prepare(sql).bind(...rw.args, limit).all();

  return {
    total: total,
    fetched: (rows.results || []).length,
    truncated: total > limit,
    courses: (rows.results || []).map(toCourse),
    facets: {},
  };
}

async function handleProviders(env, p) {
  const w = where(Object.assign({}, p, { providers: null, searchTerm: null }));

  // The picker loads this on every page view, before any search, and grouping
  // over `courses` scans the whole cycle to return ~320 rows. import-d1.js
  // precomputes the same answer into provider_counts, so read that instead --
  // but only when the request is scoped by year and level alone, which is what
  // the picker sends. Anything narrower (region, mode) is not in the
  // precomputed table and still has to be grouped live.
  const onlyYearLevel = !p.regions && !p.studyModes && !p.qualificationLevels;
  if (onlyYearLevel && p.academicYearId && p.studyLevel) {
    const fast = await env.DB.prepare(
      'SELECT provider AS name, count FROM provider_counts ' +
      'WHERE year = ? AND level = ? ORDER BY provider'
    ).bind(String(p.academicYearId), p.studyLevel).all().catch(() => null);
    // Missing or not yet populated (a database imported before this table
    // existed): fall through to the live GROUP BY rather than return nothing.
    if (fast && fast.results && fast.results.length) {
      return {
        providers: fast.results.map(r => ({ name: r.name, value: r.name, count: r.count })),
      };
    }
  }

  const rows = await env.DB.prepare(
    'SELECT provider AS name, COUNT(*) AS count FROM courses ' + w.sql +
    ' GROUP BY provider ORDER BY provider'
  ).bind(...w.args).all();
  return {
    providers: (rows.results || []).map(r => ({ name: r.name, value: r.name, count: r.count })),
  };
}

async function handleFacets(env, p) {
  const w = where(p);
  const group = async col => {
    const rows = await env.DB.prepare(
      'SELECT ' + col + ' AS k, COUNT(*) AS n FROM courses ' + w.sql +
      ' AND ' + col + ' IS NOT NULL GROUP BY ' + col + ' ORDER BY n DESC'
    ).bind(...w.args).all().catch(() => ({ results: [] }));
    const out = {};
    for (const r of rows.results || []) out[r.k] = r.n;
    return out;
  };
  // `where` always emits at least year/level for these calls, so the extra
  // AND above is safe; guard anyway for a filterless request.
  if (!w.sql) return { counts: {} };
  // The four group-bys are independent, so issue them together rather than
  // paying four serial round-trips to D1.
  const [providers, qualifications, studyModes, regions] = await Promise.all([
    group('provider'),
    group('award_level'),
    group('study_mode'),
    group('region'),
  ]);
  return {
    counts: {
      providers: providers,
      qualifications: qualifications,
      studyModes: studyModes,
      regions: regions,
    },
  };
}

// Shortlisted courses by courseId. The id is stable across cycles, so a
// shortlist stores it without a year and each course resolves to the selected
// cycle where it runs, else its latest. rowid_key is courseId + '-' + year,
// so this is primary-key lookups rather than a scan: there is no index on
// course_id, and a scan reads all ~30k rows to find a handful.
const SHORTLIST_MAX = 200;

async function handleCourses(env, p) {
  const ids = [...new Set((p.ids || []).map(String))]
    .filter(id => /^[0-9a-f-]{36}$/.test(id)).slice(0, SHORTLIST_MAX);
  if (!ids.length) return { courses: [] };
  const level = p.studyLevel || 'Undergraduate';

  let cycles = await env.DB.prepare('SELECT DISTINCT year FROM provider_counts WHERE level = ?')
    .bind(level).all().catch(() => null);
  if (!cycles || !cycles.results || !cycles.results.length) {
    cycles = await env.DB.prepare('SELECT DISTINCT year FROM courses WHERE level = ?')
      .bind(level).all();
  }
  const years = (cycles.results || []).map(r => String(r.year));

  // D1 caps a statement at 100 bound parameters.
  const keys = ids.flatMap(id => years.map(y => id + '-' + y));
  const found = [];
  for (let i = 0; i < keys.length; i += 90) {
    const part = keys.slice(i, i + 90);
    const rows = await env.DB.prepare('SELECT * FROM courses WHERE rowid_key IN (' +
      part.map(() => '?').join(',') + ') AND level = ?').bind(...part, level).all();
    found.push(...(rows.results || []));
  }

  const want = p.academicYearId ? String(p.academicYearId) : null;
  const best = new Map();
  for (const r of found) {
    const had = best.get(r.course_id);
    if (!had || (r.year === want) > (had.year === want) ||
        ((r.year === want) === (had.year === want) && r.year > had.year)) best.set(r.course_id, r);
  }
  return { courses: ids.filter(id => best.has(id)).map(id => toCourse(best.get(id))) };
}

async function handleMeta(env) {
  const rows = await env.DB.prepare('SELECT key, value FROM meta').all()
    .catch(() => ({ results: [] }));
  const meta = {};
  for (const r of rows.results || []) meta[r.key] = r.value;
  // Same reasoning as handleProviders: this runs on every page load (the page
  // reads it for the snapshot-age chip and to prune the entry-year dropdown),
  // and counting `courses` directly means a full table scan. Summing the ~320
  // precomputed provider rows gives an identical answer.
  let years = await env.DB.prepare(
    'SELECT year, level, SUM(count) AS n FROM provider_counts ' +
    'GROUP BY year, level ORDER BY year DESC'
  ).all().catch(() => null);
  if (!years || !years.results || !years.results.length) {
    years = await env.DB.prepare(
      'SELECT year, level, COUNT(*) AS n FROM courses GROUP BY year, level ORDER BY year DESC'
    ).all().catch(() => ({ results: [] }));
  }
  return { meta: meta, cycles: years.results || [] };
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname.startsWith('/api/')) {
      let p = {};
      if (request.method === 'POST') {
        p = await request.json().catch(() => ({}));
      }
      try {
        if (url.pathname === '/api/search' || url.pathname === '/api/bulk') {
          return json(await handleSearch(env, p));
        }
        if (url.pathname === '/api/providers') return json(await handleProviders(env, p));
        if (url.pathname === '/api/facets') return json(await handleFacets(env, p));
        if (url.pathname === '/api/meta') return json(await handleMeta(env));
        if (url.pathname === '/api/courses') return json(await handleCourses(env, p));
        // One stored JSON record per Discover Uni course, passed through as
        // text. A primary-key read: one row per panel opened.
        if (url.pathname === '/api/hesa') {
          const row = p.key ? await env.DB.prepare('SELECT data FROM hesa WHERE kis_key = ?')
            .bind(String(p.key)).first() : null;
          return new Response(row ? row.data : 'null', {
            headers: { 'Content-Type': 'application/json', 'Cache-Control': 'public, max-age=3600' },
          });
        }
        // Requirements are resolved at import time and stored on the row, so
        // the live borrowing endpoint has nothing to do here.
        if (url.pathname === '/api/tariffs') {
          return json({ year: null, tariffs: {}, byTitle: {}, grades: {}, gradesByTitle: {} });
        }
        // Bulk export builds files on disk from the live Algolia index, which
        // a Worker can do neither of. Say so plainly rather than half-failing.
        if (url.pathname === '/api/export/plan' || url.pathname === '/api/export/run') {
          return json({
            error: 'Bulk export runs locally only — this site serves a fixed snapshot. ' +
                   'Use `npm start` then http://localhost:8787/export, or the CLI: ' +
                   'npm run export -- --year 2027',
          }, 501);
        }
        return json({ error: 'Unknown endpoint' }, 404);
      } catch (err) {
        return json({ error: String(err && err.message || err) }, 500);
      }
    }

    // Everything else is the static site, served by Workers Assets.
    return env.ASSETS.fetch(request);
  },
};
