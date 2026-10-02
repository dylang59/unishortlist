// Discover Uni (OfS/HESA) figures for the course panel.
//
// courselinks.js finds the Discover Uni course behind each UCAS row and hands
// back its key, PUBUKPRN|UKPRN|KISCOURSEID|KISMODE -- the key every Discover
// Uni table joins on. This module turns that key into one compact JSON record
// holding everything the panel shows, plus the UK figures to compare against,
// so the Worker answers a panel with a single row read.
//
// Most figures are not about the course itself. When a course is too small to
// report alone, HESA pools it with the rest of its subject at that provider,
// and failing that a wider subject group, sometimes over two years. Each table
// says which in its AGG code: the first digit is the years pooled, the second
// the level -- 4 this course, 3/2/1 the CAH subject group at levels 3/2/1
// (verified 2026-10-02: the SBJ field is empty exactly when the level is 4, and
// otherwise holds a code of that depth). Salaries are never course-level.
// Every block keeps its code, year and population so the panel can say so.
//
// Record shape (short keys; this is stored once per course):
//   { v, lvl, f: [sandwich, yearAbroad, foundation], acc: [[text, url]],
//     <block>: { a: AGG, y: year, s: subject, n: population, r: response %,
//                v: [values], b: [UK values], bs: subject of the UK values } }
// Blocks and their value order are in TABLES below.
const fs = require('fs');
const path = require('path');
const { parseCsv, DEFAULT_DIR } = require('./courselinks');

const VERSION = 1;

// key -> [file, field prefix, values]. A course has data in a table when its
// first value is filled in.
const TABLES = {
  tar:  ['TARIFF', 'TAR', ['T001', 'T048', 'T064', 'T080', 'T096', 'T112', 'T128', 'T144',
                           'T160', 'T176', 'T192', 'T208', 'T224', 'T240']],
  ent:  ['ENTRY', 'ENT', ['ALEVEL', 'BACC', 'ACCESS', 'FOUNDTN', 'DEGREE', 'OTHERHE', 'OTHER', 'NOQUALS']],
  nss:  ['NSS', 'NSS', ['T1', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7']],
  cont: ['CONTINUATION', 'CONT', ['UCONT', 'ULEFT', 'ULOWER', 'UGAINED', 'UDORMANT']],
  emp:  ['EMPLOYMENT', 'EMP', ['WORKSTUDY', 'WORK', 'STUDY', 'BOTH', 'UNEMP', 'NOAVAIL', 'PREVWORKSTUD']],
  job:  ['JOBTYPE', 'JOB', ['PROFMAN', 'OTHERJOB', 'UNKWN']],
  voice:['GOVOICEWORK', 'GOWORK', ['GOWORKMEAN', 'GOWORKONTRACK', 'GOWORKSKILLS']],
  sal:  ['GOSALARY', 'GOSAL', ['GOINSTLQ', 'GOINSTMED', 'GOINSTUQ']],
  leo3: ['LEO3', 'LEO3', ['LEO3INSTLQ', 'LEO3INSTMED', 'LEO3INSTUQ']],
  leo5: ['LEO5', 'LEO5', ['LEO5INSTLQ', 'LEO5INSTMED', 'LEO5INSTUQ']],
  com:  ['COMMON', 'COM', []],
};

// The job list is a handful of 5%-rounded shares; below this many graduates
// each one is a single person, which reads as more than it is.
const JOBS_MIN_POP = 20;
// A UK comparison drawn from fewer providers than this is not shown.
const BENCH_MIN_PROVIDERS = 5;

const key = r => [r.PUBUKPRN, r.UKPRN, r.KISCOURSEID, r.KISMODE].join('|');
const num = v => v === '' || v == null || isNaN(Number(v)) ? null : Number(v);
const median = a => {
  a = a.filter(x => x != null).sort((x, y) => x - y);
  if (!a.length) return null;
  const m = a.length >> 1;
  return a.length % 2 ? a[m] : Math.round((a[m - 1] + a[m]) / 2);
};
// CAH07-01-01 -> [CAH07-01-01, CAH07-01, CAH07]
const lineage = code => {
  const p = String(code || '').split('-');
  return p[0] ? p.map((_, i) => p.slice(0, i + 1).join('-')).reverse() : [];
};

// Returns { get(key), size }, or null when the dataset is not on disk.
function load(dir) {
  dir = dir || DEFAULT_DIR;
  const file = n => path.join(dir, n + '.csv');
  if (!fs.existsSync(file('KISCOURSE'))) return null;
  const read = n => fs.existsSync(file(n)) ? parseCsv(fs.readFileSync(file(n), 'utf8')) : [];

  const course = {};
  for (const c of read('KISCOURSE')) course[key(c)] = c;
  const sbj = {};
  for (const r of read('SBJ')) (sbj[key(r)] = sbj[key(r)] || []).push(r.SBJ);

  // One row per course per table. Joint courses can have a row per subject;
  // keep the one covering the most students.
  const rows = {};
  for (const [k, [name, pre, vals]] of Object.entries(TABLES)) {
    const by = rows[k] = {};
    for (const r of read(name)) {
      if (vals.length && r[vals[0]] === '') continue;
      const kk = key(r), cur = by[kk];
      if (!cur || (num(r[pre + 'POP']) || 0) > (num(cur[pre + 'POP']) || 0)) by[kk] = r;
    }
  }

  const jobs = {};
  for (const r of read('JOBLIST')) (jobs[key(r)] = jobs[key(r)] || []).push(r);
  const accText = {};
  for (const r of read('ACCREDITATIONTABLE')) accText[r.ACCTYPE] = [r.ACCTEXT, r.ACCURL];
  const acc = {};
  for (const r of read('ACCREDITATION')) if (accText[r.ACCTYPE]) (acc[key(r)] = acc[key(r)] || []).push(accText[r.ACCTYPE]);
  const gosec = {};
  for (const r of read('GOSECSAL')) {
    gosec[r.GOSECSBJ + '|' + r.KISMODE + '|' + r.KISLEVEL] =
      [num(r.GOSECLQ_UK), num(r.GOSECMED_UK), num(r.GOSECUQ_UK)];
  }

  // The subject a block is about: its own pooling subject when it has one,
  // otherwise the course's subject (the first, for a joint course).
  const subjectOf = (r, pre, kk) => r[pre + 'SBJ'] || (sbj[kk] || [])[0] || '';

  // ---- UK comparisons --------------------------------------------------
  // Per subject (at every CAH level), mode and course level: the median across
  // providers, each provider counted once by the median of its distinct rows.
  // Pooled rows repeat across every course they cover, hence "distinct". The
  // entrant tariff comparison is a distribution, so it is pooled instead,
  // weighted by entrants. Salary uses HESA's own sector figures (GOSECSAL).
  const bench = {};
  for (const [k, [, pre, vals]] of Object.entries(TABLES)) {
    if (!vals.length || k === 'sal') continue;
    const groups = {}; // subject|mode|level -> provider -> distinct rows
    for (const [kk, r] of Object.entries(rows[k])) {
      const c = course[kk];
      if (!c) continue;
      // A joint course's own figures belong to no single subject.
      if (!r[pre + 'SBJ'] && (sbj[kk] || []).length !== 1) continue;
      for (const code of lineage(subjectOf(r, pre, kk))) {
        const g = groups[code + '|' + c.KISMODE + '|' + c.KISLEVEL] =
          groups[code + '|' + c.KISMODE + '|' + c.KISLEVEL] || {};
        const p = g[r.PUBUKPRN] = g[r.PUBUKPRN] || new Map();
        p.set(vals.map(v => r[v]).join(',') + '|' + r[pre + 'SBJ'], r);
      }
    }
    const out = bench[k] = {};
    for (const [g, provs] of Object.entries(groups)) {
      const list = Object.values(provs).map(m => [...m.values()]);
      if (list.length < BENCH_MIN_PROVIDERS) continue;
      if (k === 'tar') {
        const tot = vals.map(() => 0);
        let w = 0;
        for (const rs of list) for (const r of rs) {
          const n = num(r[pre + 'POP']) || 0;
          w += n;
          vals.forEach((v, i) => { tot[i] += n * (num(r[v]) || 0); });
        }
        if (w) out[g] = tot.map(t => Math.round(t / w * 10) / 10);
      } else {
        out[g] = vals.map(v => median(list.map(rs => median(rs.map(r => num(r[v]))))));
      }
    }
  }

  function block(k, kk, c) {
    const [, pre, vals] = TABLES[k];
    const r = rows[k][kk];
    if (!r) return null;
    const b = {
      a: r[pre + 'AGG'], y: r[pre + 'AGGYEAR'] || r[pre + 'YEAR1'] || '',
      s: r[pre + 'SBJ'] || '', n: num(r[pre + 'POP']),
    };
    const rr = num(r[pre + 'RESP_RATE']);
    if (rr != null) b.r = rr;
    if (vals.length) b.v = vals.map(v => num(r[v]));
    // Compare at the most specific subject level that has a UK figure.
    for (const code of lineage(subjectOf(r, pre, kk))) {
      const g = code + '|' + c.KISMODE + '|' + c.KISLEVEL;
      const bv = k === 'sal' ? gosec[g] : bench[k] && bench[k][g];
      if (bv && bv.some(x => x != null)) { b.b = bv; b.bs = code; break; }
    }
    return b;
  }

  const memo = new Map();
  function get(kk) {
    if (memo.has(kk)) return memo.get(kk);
    const c = course[kk];
    let rec = null;
    if (c) {
      rec = { v: VERSION, lvl: c.KISLEVEL,
              f: [num(c.SANDWICH) || 0, num(c.YEARABROAD) || 0, num(c.FOUNDATION) || 0] };
      for (const k of Object.keys(TABLES)) {
        if (k === 'com') continue;
        const b = block(k, kk, c);
        if (b) rec[k] = b;
      }
      const com = rows.com[kk];
      if (com && (num(com.COMPOP) || 0) >= JOBS_MIN_POP && jobs[kk]) {
        rec.jobs = {
          a: com.COMAGG, y: com.COMAGGYEAR || '', s: com.COMSBJ || '', n: num(com.COMPOP),
          v: jobs[kk].filter(j => !j.COMSBJ || j.COMSBJ === com.COMSBJ)
            .sort((x, y) => num(y.PERC) - num(x.PERC)).slice(0, 5)
            .map(j => [j.JOB, num(j.PERC)]),
        };
      }
      if (acc[kk]) rec.acc = acc[kk];
    }
    memo.set(kk, rec);
    return rec;
  }

  return { get: get, size: Object.keys(course).length };
}

// SQL that loads the records for `keys` (the kis_key values the courses rows
// reference). Shared by the snapshot import and the courselinks backfill, so
// a new Discover Uni download refreshes these the same way it refreshes the
// links. Records no longer referenced by any row are dropped at the end.
function toSql(hesa, keys) {
  const q = v => v == null ? 'NULL' : "'" + String(v).replace(/'/g, "''") + "'";
  const parts = ['CREATE TABLE IF NOT EXISTS hesa (kis_key TEXT PRIMARY KEY, data TEXT NOT NULL);'];
  const recs = [...keys].map(k => [k, hesa.get(k)]).filter(([, r]) => r);
  // Records run to ~4 KB; 10 a statement stays well inside D1's limit.
  for (let i = 0; i < recs.length; i += 10) {
    parts.push('INSERT OR REPLACE INTO hesa (kis_key, data) VALUES\n' +
      recs.slice(i, i + 10).map(([k, r]) => '(' + q(k) + ',' + q(JSON.stringify(r)) + ')').join(',\n') + ';');
  }
  parts.push('DELETE FROM hesa WHERE kis_key NOT IN ' +
             '(SELECT kis_key FROM courses WHERE kis_key IS NOT NULL);');
  return { sql: parts, count: recs.length };
}

module.exports = { load: load, toSql: toSql, VERSION: VERSION };
