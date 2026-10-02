// Course page links from the Discover Uni dataset.
//
// UCAS publishes no link to the course on the university's own site: the
// search index carries only the provider homepage, and the course pages sit
// behind a bot challenge. Discover Uni (OfS/HESA open data) does. Every
// course a provider submits has a CRSEURL, written by the provider itself.
//
// There is no shared course key. Discover Uni's UCASCOURSEID is a four-digit
// internal number, not the application code (N321) UCAS shows, so the join is
// provider + course title:
//
//   1. provider by UKPRN (Discover Uni's PUBUKPRN), falling back to website
//      domain for rows without one; then, if no title matches there, courses
//      whose page is on the provider's own site, whoever they are filed under
//   2. exact title, after normalising punctuation and filler words
//   3. failing that, the base title with variants stripped ("with a Year in
//      Industry", "with Foundation Year", "(4 years)"). Discover Uni usually
//      lists only the base course, and the variants live on its page.
//
// Ties go to the course whose KISCOURSEID or page URL contains the application
// code (some providers embed it: LSE's N321-UBACT2, Lancaster's .../physics-
// bsc-hons-f300/), then to the matching mode.
//
// The dataset is downloaded by hand: HESA's site blocks scripted fetches.
//   https://www.hesa.ac.uk/support/tools-and-downloads/unistats
// Unzip it to data/hesa/DiscoverUni_latest (git-ignored, ~450 MB).
//
// Backfill an existing snapshot without re-pulling from Algolia, after a new
// Discover Uni download (it clears and rewrites the cycle's links, kis_key and
// the panel's hesa records -- see hesa.js):
//   node courselinks.js --snapshot snapshot-2027.sql --out links-2027.sql
//   npx wrangler d1 execute ucasbuster --remote --file=links-2027.sql
// The snapshot must carry the ukprn column (any built since it was added);
// the report warns if it does not.
const fs = require('fs');
const path = require('path');

const DEFAULT_DIR = path.join(__dirname, 'data', 'hesa', 'DiscoverUni_latest');

function parseCsv(text) {
  const rows = [];
  let row = [], f = '', quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c !== '"') f += c;
      else if (text[i + 1] === '"') { f += '"'; i++; }
      else quoted = false;
    } else if (c === '"') quoted = true;
    else if (c === ',') { row.push(f); f = ''; }
    else if (c === '\n') { row.push(f.replace(/\r$/, '')); rows.push(row); row = []; f = ''; }
    else f += c;
  }
  if (f || row.length) { row.push(f); rows.push(row); }
  const head = rows.shift() || [];
  return rows.filter(r => r.length > 1)
             .map(r => Object.fromEntries(head.map((k, i) => [k, r[i]])));
}

const host = u => String(u || '').trim().toLowerCase()
  .replace(/^https?:\/\//, '').replace(/^www\./, '').split(/[\/#?:]/)[0];

// The registrable domain: study.ed.ac.uk and www.ed.ac.uk are one site.
const SLD = /^(ac|co|org|gov|nhs|sch|ltd|plc|me|net)\.uk$/;
const site = u => {
  const p = host(u).split('.');
  return p.slice(SLD.test(p.slice(-2).join('.')) ? -3 : -2).join('.');
};

const FILLER =/\b(with|a|an|the|of|in|and)\b/g;
const norm = t => String(t || '').normalize('NFD').replace(/[̀-ͯ]/g, '')
  .toLowerCase().replace(/&/g, ' and ').replace(/\(hons\)/g, '')
  .replace(/[^a-z0-9]+/g, ' ').replace(FILLER, ' ').replace(/\s+/g, ' ').trim();

// Variant suffixes that Discover Uni folds into the base course.
const VARIANT = new RegExp('\\b(' + [
  'with (an? )?(integrated )?(foundation year|year (in|of) (industry|placement|professional experience)' +
    '|placement year|professional placement|industrial( placement|/professional)? experience' +
    '|(a )?year abroad|study abroad|year in [a-z]+)',
  'including (a )?(year abroad|foundation year|placement year)',
  'flying start degree programme',
  '\\d years?',
].join('|') + ')\\b', 'g');
// The Open University puts its own qualification code in the UCAS title,
// "Accounting and Finance (R52)", "Arts and Humanities (Art History) (R14-AH)";
// Discover Uni's titles leave it out.
const QUALCODE = /\(\s*[A-Z]{1,2}\d{1,3}(-[A-Z]{1,3})?\s*\)/g;
// Some providers lead or end the UCAS title with the award -- UCL's
// "Philosophy, Politics and Economics BSc", NTU's "BMus Songwriting" -- where
// Discover Uni's title is the subject alone. Only at either end, so a title
// that merely contains one ("Bachelor of Laws (UCL) and LLB ...") is left be.
const AWARD = '(ba|bsc|beng|meng|msci|mmath|mphys|mchem|mbiol|mpharm|llb|bmus|bed|bdes|mdes|' +
  'barch|march|bfa|bn|bmedsci|fda|fdsc|fdeng)';
const AWARDS = new RegExp('^\\s*' + AWARD + '\\b|\\b' + AWARD + '\\s*$', 'g');
const base = t => norm(String(t || '').replace(QUALCODE, ' ').replace(/\(([^)]*)\)/g, ' $1 ')
  .toLowerCase().replace(VARIANT, ' ')).replace(AWARDS, ' ').trim();

function push(map, k, v) { (map[k] = map[k] || []).push(v); }

// Returns a matcher, or null when the dataset is not on disk.
function load(dir) {
  dir = dir || DEFAULT_DIR;
  const file = n => path.join(dir, n);
  if (!fs.existsSync(file('KISCOURSE.csv'))) return null;
  const read = n => parseCsv(fs.readFileSync(file(n), 'utf8'));

  const courses = read('KISCOURSE.csv').filter(c => c.CRSEURL);

  // Discover Uni carries two provider numbers. UKPRN is the registering
  // provider, PUBUKPRN the one the course is published under -- and the UKPRN
  // UCAS gives is always the latter. Checked 2026-10-02 against all 320 2027
  // providers: 293 found as PUBUKPRN, none only as UKPRN. Keying on UKPRN
  // missed franchised providers outright (UA92 is registered by Lancaster,
  // Coleg Sir Gar by UWTSD) and handed the registering university its
  // partners' courses as extra candidates.
  const known = new Set(courses.map(c => c.PUBUKPRN));

  // Domain -> PUBUKPRN, for rows that arrive without a usable UKPRN. Course
  // page hosts are included because PROVURL lags rebrands (soton.ac.uk,
  // anglia.ac.uk). It cannot bridge a domain the two datasets disagree on --
  // UCAS lists Lancaster as lancaster.ac.uk, Discover Uni as lancs.ac.uk --
  // which is why the UKPRN must reach here whenever UCAS supplies one.
  const byDomain = {};
  const addDomain = (d, uk) => { if (d && known.has(uk)) (byDomain[d] = byDomain[d] || new Set()).add(uk); };
  for (const r of read('INSTITUTION.csv')) addDomain(host(r.PROVURL), r.PUBUKPRN);
  for (const c of courses) addDomain(host(c.CRSEURL), c.PUBUKPRN);

  // Titles are indexed twice: under the publishing provider, and under the
  // site the course page lives on. The second catches courses Discover Uni
  // files under someone else's number while the page sits on the provider's
  // own site -- Coleg Sir Gar's degrees are published under UWTSD, some of
  // Staffordshire's under a partner college. Matching by site rather than by
  // the registering provider's number keeps partner colleges' pages out:
  // those live on the partner's site, and linking Reading's Children's
  // Development and Learning to bcot.ac.uk was the kind of thing that did.
  const byTitle = {}, byBase = {}, bySiteTitle = {}, bySiteBase = {};
  for (const c of courses) {
    push(byTitle, c.PUBUKPRN + '|' + norm(c.TITLE), c);
    push(byBase, c.PUBUKPRN + '|' + base(c.TITLE), c);
    push(bySiteTitle, site(c.CRSEURL) + '|' + norm(c.TITLE), c);
    push(bySiteBase, site(c.CRSEURL) + '|' + base(c.TITLE), c);
  }

  // r: { ukprn, providerUrl, title, studyMode, appCode }
  // -> { url, how: 'exact' | 'base', by: 'ukprn' | 'domain' | 'site' } or null
  function match(r) {
    const byUkprn = !!(r.ukprn && known.has(String(r.ukprn)));
    const uks = byUkprn
      ? [String(r.ukprn)]
      : [...(byDomain[host(r.providerUrl)] || [])];
    const own = site(r.providerUrl);
    const tiers = [
      [byUkprn ? 'ukprn' : 'domain', uks, byTitle, byBase],
      ['site', own ? [own] : [], bySiteTitle, bySiteBase],
    ];
    for (const [by, ids, exact, based] of tiers) {
      for (const [how, idx, t] of [['exact', exact, norm(r.title)], ['base', based, base(r.title)]]) {
        const hits = [].concat(...ids.map(id => idx[id + '|' + t] || []));
        if (hits.length) return pick(hits, r, how, by);
      }
    }
    return null;
  }

  function pick(hits, r, how, by) {
    const narrow = keep => { const n = hits.filter(keep); if (n.length) hits = n; };
    const code = String(r.appCode || '').toUpperCase();
    if (code) narrow(h => h.KISCOURSEID.toUpperCase().includes(code) ||
                          new RegExp('\\b' + code + '\\b', 'i').test(h.CRSEURL));
    const mode = /part/i.test(r.studyMode || '') ? '02' : '01';
    narrow(h => h.KISMODE === mode);

    const h = hits[0];
    return { url: h.CRSEURL.trim(), how: how, by: by,
             kis: [h.PUBUKPRN, h.UKPRN, h.KISCOURSEID, h.KISMODE].join('|') };
  }

  return { match: match, courses: courses.length, providers: known };
}

// ---- Coverage report --------------------------------------------------------

// items: [{ provider, ukprn, m }] where m is what match() returned. Printed by
// both the snapshot import and the backfill, so a provider that silently stops
// linking -- a domain change, a renumbering, a dropped UKPRN -- shows up by
// name in the output of the next run instead of as a slightly lower total.
// Lancaster sat at 0 of 474 for a whole cycle because only the total was shown.
function report(items, links, log) {
  log = log || console.log;
  const pct = (a, b) => (100 * a / (b || 1)).toFixed(1) + '%';
  const tally = {}, prov = {};
  let noUkprn = 0;
  for (const it of items) {
    const p = prov[it.provider] = prov[it.provider] || { n: 0, linked: 0, ukprn: it.ukprn };
    p.n++;
    if (!it.ukprn) noUkprn++;
    if (it.m) { p.linked++; tally[it.m.by] = (tally[it.m.by] || 0) + 1; }
  }
  const linked = items.filter(it => it.m).length;
  log('  with course page  : ' + linked.toLocaleString() + '  (' + pct(linked, items.length) + ')');
  log('    matched by      : ' + ['ukprn', 'domain', 'site']
    .map(k => k + ' ' + (tally[k] || 0).toLocaleString()).join(', '));
  if (noUkprn) {
    log('  WARNING: ' + noUkprn.toLocaleString() + ' rows have no UKPRN, so they can only match by ' +
        'website domain. If that is every row, the snapshot predates the ukprn column: rebuild it ' +
        'with `npm run snapshot` rather than backfilling.');
  }

  // Providers with nothing linked, biggest first. "not in Discover Uni" is
  // expected for small colleges that do not report; anything else is worth a
  // look, since the provider is there and none of its titles matched.
  const none = Object.entries(prov).filter(([, p]) => p.n >= 5 && !p.linked)
    .sort((a, b) => b[1].n - a[1].n);
  if (none.length) {
    log('  providers with no course pages (5+ rows):');
    for (const [name, p] of none) {
      const why = !p.ukprn ? 'no UKPRN from UCAS'
        : links.providers.has(String(p.ukprn)) ? 'in Discover Uni, no titles matched'
        : 'UKPRN ' + p.ukprn + ' not in Discover Uni';
      log('    ' + String(p.n).padStart(4) + '  ' + name + '  -- ' + why);
    }
  }
}

// ---- Backfill CLI ---------------------------------------------------------

// Pull the columns we need out of a snapshot written by import-d1.js. The
// file is ours, so a tuple reader is enough: each row is one line starting
// "('". Fields are looked up by name from the INSERT's column list, not by
// position, so a snapshot from before a column was added still reads -- this
// one used to stop at provider_url and never saw the ukprn after it.
function snapshotRows(file) {
  const rows = [];
  // Only tuples under an INSERT into courses: the snapshot also carries the
  // hesa records, which read as 19,584 course rows with no provider or UKPRN.
  let col = null, inCourses = false;
  for (const line of fs.readFileSync(file, 'utf8').split('\n')) {
    if (line.startsWith('INSERT')) {
      inCourses = /^INSERT( OR REPLACE)? INTO courses \(/.test(line);
      const m = inCourses && !col && line.match(/\(([^)]*)\)\s*VALUES/);
      if (m) col = Object.fromEntries(m[1].split(',').map((c, i) => [c.trim(), i]));
    }
    if (!inCourses || !line.startsWith("('")) continue;
    const t = [];
    let i = 1;
    while (i < line.length) {
      if (line[i] === "'") {
        let s = '';
        for (i++; i < line.length; ) {
          if (line[i] === "'" && line[i + 1] === "'") { s += "'"; i += 2; }
          else if (line[i] === "'") { i++; break; }
          else s += line[i++];
        }
        t.push(s);
      } else {
        let s = '';
        while (i < line.length && line[i] !== ',' && line[i] !== ')') s += line[i++];
        t.push(s === 'NULL' ? null : s);
      }
      if (line[i] === ',') i++; else break;
    }
    if (!col) throw new Error(file + ': no INSERT column list before the first row');
    const f = name => col[name] == null ? null : t[col[name]];
    rows.push({ key: f('rowid_key'), year: f('year'), level: f('level'),
                title: f('title'), provider: f('provider'),
                studyMode: f('study_mode'), appCode: f('app_code'),
                providerUrl: f('provider_url'), ukprn: f('ukprn') });
  }
  return rows;
}

function main() {
  const args = process.argv.slice(2);
  const get = (flag, def) => { const i = args.indexOf(flag); return i >= 0 ? args[i + 1] : def; };
  const snap = get('--snapshot');
  const out = get('--out', 'links.sql');
  if (!snap) { console.error('usage: node courselinks.js --snapshot snapshot-2027.sql [--out links.sql] [--hesa dir]'); process.exit(1); }

  const links = load(get('--hesa'));
  if (!links) { console.error('Discover Uni dataset not found; see the header of courselinks.js'); process.exit(1); }

  const q = v => v == null ? 'NULL' : "'" + String(v).replace(/'/g, "''") + "'";
  const rows = snapshotRows(snap);

  // Clear the cycle first. Writing only the matches would leave a link the
  // matcher has since dropped -- a partner college's page, say -- in place
  // for good.
  const parts = [];
  const cycles = new Set(rows.map(r => r.year + '|' + r.level));
  for (const c of cycles) {
    const [year, level] = c.split('|');
    parts.push('UPDATE courses SET course_url=NULL, course_link=NULL, kis_key=NULL WHERE year=' +
               q(year) + ' AND level=' + q(level) + ';');
  }
  const items = [], keys = new Set();
  for (const r of rows) {
    const m = links.match(r);
    items.push({ provider: r.provider, ukprn: r.ukprn, m: m });
    if (!m) continue;
    keys.add(m.kis);
    parts.push('UPDATE courses SET course_url=' + q(m.url) + ', course_link=' + q(m.how) +
               ', kis_key=' + q(m.kis) + ' WHERE rowid_key=' + q(r.key) + ';');
  }

  // The panel's Discover Uni figures come from the same download, so refresh
  // them alongside. Required here rather than at the top: hesa.js requires
  // this module.
  const hesa = require('./hesa').load(get('--hesa'));
  const h = require('./hesa').toSql(hesa, keys);
  parts.push(...h.sql);

  fs.writeFileSync(out, parts.join('\n') + '\n');
  console.log('wrote ' + out);
  console.log('  rows              : ' + rows.length.toLocaleString());
  report(items, links);
  console.log('  Discover Uni data : ' + h.count.toLocaleString() + ' courses');
}

// Exported before main() runs: hesa.js, which main() requires, requires this.
module.exports = { load: load, report: report, parseCsv: parseCsv, snapshotRows: snapshotRows,
                   DEFAULT_DIR: DEFAULT_DIR };

if (require.main === module) main();
