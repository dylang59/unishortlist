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
    optionCount: 1,
    summary: '',
  };
}

// Build a WHERE clause from the same filter vocabulary the Algolia server used.
function where(p) {
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

  if (p.searchTerm && p.searchTerm.trim()) {
    // LIKE over title, provider and the subject keyword blob. Simple, and on
    // 30k rows it stays comfortably fast.
    const t = '%' + p.searchTerm.trim().toLowerCase() + '%';
    sql.push('(lower(title) LIKE ? OR lower(provider) LIKE ? OR lower(subjects) LIKE ?)');
    args.push(t, t, t);
  }
  return { sql: sql.length ? 'WHERE ' + sql.join(' AND ') : '', args: args };
}

async function handleSearch(env, p) {
  const w = where(p);
  const limit = Math.min(Number(p.limit) || 300, PAGE_MAX);

  const countRow = await env.DB.prepare('SELECT COUNT(*) AS n FROM courses ' + w.sql)
    .bind(...w.args).first();

  const rows = await env.DB.prepare(
    'SELECT * FROM courses ' + w.sql + ' ORDER BY provider_sort, title LIMIT ?'
  ).bind(...w.args, limit).all();

  return {
    total: countRow ? countRow.n : 0,
    fetched: (rows.results || []).length,
    truncated: (countRow ? countRow.n : 0) > limit,
    courses: (rows.results || []).map(toCourse),
    facets: {},
  };
}

async function handleProviders(env, p) {
  const w = where(Object.assign({}, p, { providers: null, searchTerm: null }));
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
  return {
    counts: {
      providers: await group('provider'),
      qualifications: await group('award_level'),
      studyModes: await group('study_mode'),
      regions: await group('region'),
    },
  };
}

async function handleMeta(env) {
  const rows = await env.DB.prepare('SELECT key, value FROM meta').all()
    .catch(() => ({ results: [] }));
  const meta = {};
  for (const r of rows.results || []) meta[r.key] = r.value;
  const years = await env.DB.prepare(
    'SELECT year, level, COUNT(*) AS n FROM courses GROUP BY year, level ORDER BY year DESC'
  ).all().catch(() => ({ results: [] }));
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
                   'Use `npm start` then http://localhost:8787/export.html, or the CLI: ' +
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
