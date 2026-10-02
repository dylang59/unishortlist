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
//   1. provider by UKPRN, falling back to website domain for rows without one
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
// Backfill an existing snapshot without re-pulling from Algolia:
//   node courselinks.js --snapshot snapshot-2027.sql --out links-2027.sql
//   npx wrangler d1 execute ucasbuster --remote --file=links-2027.sql
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

const FILLER = /\b(with|a|an|the|of|in|and)\b/g;
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
const base = t => norm(String(t || '').replace(/\(([^)]*)\)/g, ' $1 ').toLowerCase().replace(VARIANT, ' '));

function push(map, k, v) { (map[k] = map[k] || []).push(v); }

// Returns a matcher, or null when the dataset is not on disk.
function load(dir) {
  dir = dir || DEFAULT_DIR;
  const file = n => path.join(dir, n);
  if (!fs.existsSync(file('KISCOURSE.csv'))) return null;
  const read = n => parseCsv(fs.readFileSync(file(n), 'utf8'));

  const courses = read('KISCOURSE.csv').filter(c => c.CRSEURL);
  const known = new Set(courses.map(c => c.UKPRN));

  // Domain -> UKPRN, for rows that arrive without a UKPRN. Course page hosts
  // are included because PROVURL lags rebrands (soton.ac.uk, anglia.ac.uk).
  const byDomain = {};
  const addDomain = (d, uk) => { if (d && known.has(uk)) (byDomain[d] = byDomain[d] || new Set()).add(uk); };
  for (const r of read('INSTITUTION.csv')) addDomain(host(r.PROVURL), r.UKPRN);
  for (const c of courses) addDomain(host(c.CRSEURL), c.UKPRN);

  const byTitle = {}, byBase = {};
  for (const c of courses) {
    push(byTitle, c.UKPRN + '|' + norm(c.TITLE), c);
    push(byBase, c.UKPRN + '|' + base(c.TITLE), c);
  }

  // r: { ukprn, providerUrl, title, studyMode, appCode }
  // -> { url, how: 'exact' | 'base' } or null
  function match(r) {
    const uks = r.ukprn && known.has(String(r.ukprn))
      ? [String(r.ukprn)]
      : [...(byDomain[host(r.providerUrl)] || [])];
    if (!uks.length) return null;

    let how = 'exact';
    let hits = [].concat(...uks.map(uk => byTitle[uk + '|' + norm(r.title)] || []));
    if (!hits.length) {
      how = 'base';
      hits = [].concat(...uks.map(uk => byBase[uk + '|' + base(r.title)] || []));
    }
    if (!hits.length) return null;

    const narrow = keep => { const n = hits.filter(keep); if (n.length) hits = n; };
    const code = String(r.appCode || '').toUpperCase();
    if (code) narrow(h => h.KISCOURSEID.toUpperCase().includes(code) ||
                          new RegExp('\\b' + code + '\\b', 'i').test(h.CRSEURL));
    const mode = /part/i.test(r.studyMode || '') ? '02' : '01';
    narrow(h => h.KISMODE === mode);

    return { url: hits[0].CRSEURL.trim(), how: how };
  }

  return { match: match, courses: courses.length };
}

// ---- Backfill CLI ---------------------------------------------------------

// Pull the columns we need out of a snapshot written by import-d1.js. The
// file is ours, so a tuple reader is enough: each row is one line starting
// "('" with fields in COLS order.
function snapshotRows(file) {
  const rows = [];
  for (const line of fs.readFileSync(file, 'utf8').split('\n')) {
    if (!line.startsWith("('")) continue;
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
    // rowid_key, title, study_mode, app_code, provider_url (see import-d1 COLS)
    rows.push({ key: t[0], title: t[4], provider: t[6], studyMode: t[17], appCode: t[21], providerUrl: t[28] });
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
  const parts = [];
  let exact = 0, based = 0;
  for (const r of rows) {
    const m = links.match(r);
    if (!m) continue;
    if (m.how === 'exact') exact++; else based++;
    parts.push('UPDATE courses SET course_url=' + q(m.url) + ', course_link=' + q(m.how) +
               ' WHERE rowid_key=' + q(r.key) + ';');
  }
  fs.writeFileSync(out, parts.join('\n') + '\n');
  const n = exact + based;
  console.log('wrote ' + out);
  console.log('  rows        : ' + rows.length.toLocaleString());
  console.log('  linked      : ' + n.toLocaleString() + '  (' + (100 * n / rows.length).toFixed(1) + '%)');
  console.log('    exact     : ' + exact.toLocaleString());
  console.log('    base      : ' + based.toLocaleString());
}

if (require.main === module) main();

module.exports = { load: load, DEFAULT_DIR: DEFAULT_DIR };
