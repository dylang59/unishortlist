# ucasbuster — reference

What this is, what it knows, and how to work on it. For the short "how do I run
it" version, see [README.md](README.md).

Figures verified 2026-10-01.

---

## The two backends

The same frontend runs against either. Both speak the same JSON vocabulary, so
`public/index.html` does not know or care which one answered.

| | **Local** (`server.js`) | **Deployed** (`worker.js`) |
|---|---|---|
| URL | http://localhost:8787 | (deployment URL configured separately) |
| Data | Algolia, live | D1 snapshot, fixed |
| Freshness | current | as old as the last import |
| Cost per query | one Algolia search op, charged to UCAS | none |
| Bulk export | yes | **no** — returns 501 |
| Latency | ~200–900 ms | ~200 ms |

Use the deployed one for browsing. Use local when you need current data or the
bulk export.

**Why the snapshot exists.** Every search on the live backend costs UCAS an
Algolia operation. The snapshot moves that cost to once a month and keeps the
Algolia credentials off the network entirely — the deployed Worker has no code
path that calls Algolia.

### Snapshot drift is real

The deployed snapshot holds **29,774** rows for 2027 undergraduate. The live
index reports **29,781**. A handful of rows drift apart each day — universities
edit listings continuously. The header chip shows the snapshot date for exactly this reason;
treat the deployed figures as "about right a month ago", not as current.

---

## The data

### Source

UCAS's `courses-beta` search is an Algolia InstantSearch frontend. This project
queries the same index with the same public, search-only key the UCAS site
ships to every browser visitor.

```
POST https://Y3QRV216KL-dsn.algolia.net/1/indexes/d10prod_courses_profile/query
{"params":"query=physics&distinct=0&facetFilters=[[\"academicYearId:2027\"],[\"studyLevel:Undergraduate\"]]"}
```

App `Y3QRV216KL`, index `d10prod_courses_profile`. Override with `ALGOLIA_APP`,
`ALGOLIA_KEY`, `UCAS_INDEX` if they rotate. A second, older index
(`prod_courses`, override `UCAS_LEGACY_INDEX`) is used only for A-level grades —
see [Entry requirements](#entry-requirements).

All cycles live in **one** index; `academicYearId` is a facet within it, not a
separate index per year. Moving to a new cycle is a filter change, and old years
stay queryable.

### Coverage

Undergraduate rows per cycle, live index:

| Cycle | Rows |
|---|---|
| 2027 | 29,781 |
| 2026 | 24,162 |
| 2025 | 11,411 |

2027 is **fully published** — 320 providers in the snapshot, including UCL (453),
St Andrews, Glasgow and Liverpool.

### Rows are course *options*, not courses

With `distinct=0` the index returns one record per option — a course offered
full-time and part-time is two records, each carrying exactly one
`courseOptions` entry. Both `export.js` and `import-d1.js` read
`courseOptions[0]`, which is therefore lossless, not a shortcut.

The 2027 snapshot happens to have a unique `course_id` on every row (29,774
rows, 29,774 distinct ids) because almost everything is full-time only: 28,869
full-time against 905 part-time. Do not rely on that holding — it is a property
of this cycle, not a guarantee.

### Award levels

| Level | Rows |
|---|---|
| Bach(hons) | 22,467 |
| IMD | 2,433 |
| Masters | 1,975 |
| Cer | 841 |
| Fdg | 760 |
| Bachelor | 682 |
| Dip | 536 |

Plus small tails: `Oth`, `FD Cert`, `Foundation Year`.

---

## Two traps in the Algolia index

Both cost real debugging time. Neither errors — they return plausible wrong
answers.

### `distinct=0` is mandatory

Without it the index collapses options and `nbHits` reports a **course** count,
not a row count: **321** instead of **29,781** for 2027 undergraduate. It also
caps pagination. Every query this project issues sets `distinct=0`.

### 1,000 retrievable hits per query

`hitsPerPage` caps at **100**, and `nbPages` tops out at **10** — so any single
query yields at most 1,000 rows, silently, with no error. Paging a 29,774-row
result set straight through gives you 1,000 rows and a clean exit code.

This is why `export.js` shards by provider and then splits any overflowing
shard by qualification level. Sharding here is a correctness requirement, not
an optimisation.

When choosing shard keys: **provider facet counts sum exactly to the total**, so
they are a safe partition. **Subjects are not** — they are overlapping tags, so
a subject-sharded crawl double-counts and still misses rows.

---

## Filter vocabulary

One payload shape, mapped to Algolia `facetFilters` by `buildParams()` in
`server.js` and to SQL by `where()` in `worker.js`.

| Payload field | Algolia facet | D1 column |
|---|---|---|
| `academicYearId` | `academicYearId` | `year` |
| `studyLevel` | `studyLevel` | `level` |
| `providers[]` | `provider.name` | `provider` |
| `qualificationLevels[]` | `outcomeQualification.qualificationLevel` | `award_level` |
| `studyModes[]` | `courseOptions.studyMode.mappedCaption` | `study_mode` |
| `regions[]` | `courseOptions.location.region.grouped` | `region` |
| `searchTerm` | `query=` | `LIKE` over title/provider/subjects |
| `limit` | pages fetched | `LIMIT` |

`facetFilters` is an array of arrays: **outer AND, inner OR**. So
`providers: ["A","B"]` becomes `[["provider.name:A","provider.name:B"]]` — one
clause, ORed — which is what makes multi-university selection work.

Provider values must be the **exact display name**, including any parenthetical:
`UCL (University College London)`, `Swansea University (Abertawe)`. The plain
form returns zero hits rather than an error. Source them from the
`provider.name` facet (`/api/providers` does), never by hand.

---

## HTTP API

Both backends. All POST, all JSON body, all returning JSON.

| Endpoint | Purpose | Worker |
|---|---|---|
| `/api/search` | one page + facet counts | yes |
| `/api/bulk` | many pages, for a sortable table | yes |
| `/api/providers` | provider list with counts, for the picker | yes |
| `/api/facets` | raw facet counts | yes |
| `/api/meta` | snapshot date and row counts | yes |
| `/api/hesa` | `{key}` → one course's Discover Uni record, or `null` | yes |
| `/api/tariffs` | borrowed entry requirements | returns empty — resolved at import |
| `/api/stats` | cache hit/miss, upstream query count | no |
| `/api/export/plan` | cost estimate before exporting | **501** |
| `/api/export/run` | NDJSON progress stream | **501** |

`/api/search` returns `total`, `pageNumber`, `pageSize`, `totalPages`,
`courses[]`, `facets`. `/api/bulk` returns `total`, `fetched`, `truncated`,
`courses[]`, `facets` — note `fetched` is on `bulk` only, not `search`.

### Multi-university interleaving

Selecting several universities and truncating at `limit` drops whichever sorts
last alphabetically — UCL, in practice — so it looks like that university has no
courses. Both backends avoid this:

- `worker.js` — `ROW_NUMBER() OVER (PARTITION BY provider ORDER BY title)`,
  ordered by `rn` first, so the limit cuts depth evenly across providers.
- `server.js` — fetches each provider separately, then round-robins.

Five universities at limit 600 gives 120 each, not 220/161/19/0/0.

---

## Entry requirements

The messiest part of the data, because universities publish two incompatible
things and a new cycle has neither for months.

**A new cycle carries no tariff data.** 2027 courses had 0 tariff values when
first checked; 2026 had them on 96%. Universities publish the course long before
they finalise grades.

**Many selective universities never quote tariff points at all.** UCL, Oxford,
Cambridge and most of the Russell Group publish A-level grades — `AAB` — so
`ucasTariff` is `{min:0, max:0}` on every course they list. This is not missing
data; the metric does not apply to them.

So the column is filled from three sources, in order:

1. **This year's `ucasTariff`**, when present.
2. **Last year's points for the same `courseId`** — ids are stable across
   cycles — falling back to provider + normalised title.
3. **A-level grades from the legacy index** (`prod_courses`, field
   `options[0].entryReq_al`), most recent year first, for providers that
   produced nothing from 1 or 2.

Borrowed values render dimmed with a leading `~` and a tooltip naming the
source. Current snapshot:

| | Rows | Share |
|---|---|---|
| With a requirement | 23,636 | 79.4% |
| — borrowed points from 2026 | 19,498 | 65.5% |
| — A-level grades, legacy index | 4,138 | 13.9% |
| Nothing available | 6,114 | 20.6% |

The grade fallback covers **32 providers** and is what took UCL from 0% to ~88%.
Without it those providers show a permanently empty column, which reads as a bug
rather than as "not applicable". **14 providers** still end up with nothing at
all — no current points, no prior year, no legacy grades.

Two gotchas if you touch this code: look back **more than one year** (a sizeable
group of providers, UCL among them, have no 2026 rows at all), and **page** the
legacy index (it returns 200 per page; taking only the first page gave 23% coverage
where paging gives 88%).

---

## Course page links

UCAS publishes no link to the course on the university's own site. The search
index carries only the provider homepage (`provider.url`), the legacy index adds
nothing better, and ucas.com course pages sit behind a bot challenge.

The **Discover Uni** dataset (OfS/HESA open data) does: every course a provider
submits has a `CRSEURL`, written by the provider. `courselinks.js` joins it to
the UCAS rows at import time and stores the result in `course_url`.

**Getting the data.** HESA's site blocks scripted downloads, so fetch the zip by
hand from https://www.hesa.ac.uk/support/tools-and-downloads/unistats and unzip
it to `data/hesa/DiscoverUni_latest` (git-ignored, ~450 MB, of which only
`KISCOURSE.csv` and `INSTITUTION.csv` are read). It is updated weekly; once a
cycle is enough. Load it before the snapshot step, or re-link afterwards (below).

**There is no shared course key.** Discover Uni's `UCASCOURSEID` is a four-digit
internal number, not the application code (`N321`) UCAS shows. So the join is:

1. **Provider** by UKPRN (`provider.ukprn` in the UCAS record), falling back to
   website domain. The domain map includes course-page hosts as well as
   `PROVURL`, which lags rebrands (`soton.ac.uk`, `anglia.ac.uk`).
2. **Exact title**, normalised (case, punctuation, filler words). → `course_link='exact'`
3. **Base title**, with variant suffixes stripped: "with a Year in Industry",
   "with Foundation Year", "(4 years)", the Open University's "(R52)" and the
   like. Discover Uni usually lists only the base course, and its page covers
   the variants. → `course_link='base'`
4. If the provider has no matching title, the same two title checks among
   courses whose page is **on the provider's own site**, whoever they are filed
   under.

Ties go to the course whose `KISCOURSEID` or URL contains the application code
(LSE embeds it in the id, Lancaster in the URL), then to the matching mode.

**UCAS's UKPRN is Discover Uni's `PUBUKPRN`, not its `UKPRN`.** Discover Uni has
two provider numbers: `UKPRN` is the registering provider, `PUBUKPRN` the one
the course is published under. Of the 320 providers in 2027, 293 appear as a
`PUBUKPRN` and none only as a `UKPRN`; the other 27 are not in Discover Uni.
Matching on `UKPRN` missed franchised providers (UA92 is registered by
Lancaster) and offered a registering university its partners' courses, which
is how Reading's Children's Development and Learning came to link to bcot.ac.uk.
Step 4 exists because the reverse also happens: Coleg Sir Gar's degrees are
published under UWTSD's number but live on colegsirgar.ac.uk.

**The UKPRN has to reach the matcher.** The domain fallback cannot bridge a
domain the two datasets disagree on: UCAS gives Lancaster as lancaster.ac.uk,
Discover Uni as lancs.ac.uk. On 2026-10-02 the deployed snapshot turned out to
predate the `ukprn` column. It had been linked by backfill, so every row went
through the domain fallback and all 474 Lancaster rows had no link.

**Coverage, 2027 undergraduate (2026-10-02):** 77.1% of rows linked with
UKPRNs in place, up from 74.6% matching by domain alone. Most of the
selective universities sit at 85-99%. A sample of 80 links (before the change):
69 loaded, 10 returned 403 to a script (bot protection on UCL, MMU and others;
not checked in a browser), 1 was a real 404.

**Every run prints a coverage report**: totals by match route, a warning if the
rows carry no UKPRN, and each provider with five or more rows and no links,
with the reason: no UKPRN from UCAS, a UKPRN Discover Uni does not have, or a
provider it has but whose titles did not match. Read it after each import; a
university that drops to zero shows up there by name.

**Re-linking after a new Discover Uni download** without re-pulling from
Algolia: `node courselinks.js --snapshot snapshot-2027.sql --out links.sql`,
then run `links.sql` against D1. It clears the cycle's links before writing,
so links the matcher no longer makes are removed. It reads columns by name, so
it needs a snapshot that has the `ukprn` column.

---

## Course panel: Discover Uni figures

The course panel shows what Discover Uni reports about each matched course:
entrants' UCAS points and qualifications, continuation after the first year,
National Student Survey themes, salaries at 15 months (survey) and 3 and 5
years (tax records), what graduates are doing 15 months on, common jobs,
accreditation, and placement, year-abroad and foundation-year options.

**How it gets there.** The link matcher returns the Discover Uni course key,
`PUBUKPRN|UKPRN|KISCOURSEID|KISMODE`, which every Discover Uni table joins on.
It is stored on the row as `kis_key`. `hesa.js` turns each key into one compact
JSON record in the `hesa` table, and the panel fetches it from `/api/hesa` when
it opens: one primary-key read per course viewed, cached for an hour. Both the
snapshot step and the `courselinks.js` backfill write these records, so a new
Discover Uni download refreshes them the same way it refreshes the links.
Records no longer referenced by any row are deleted at the end. 2027
undergraduate: 19,584 records, about 1.4 KB each, 27.5 MB in all.

**Most figures are not about the course alone.** When a course is too small to
report, HESA pools it with its subject at that provider, then wider subject
groups, sometimes over two years. Each table's `…AGG` code says which: first
digit the years pooled, second the level (4 = this course; 3, 2, 1 = CAH subject
groups at those levels). This was checked against the data: the `…SBJ` field is
empty exactly when the level is 4. The panel puts a chip on every block, green
"This course" or amber "Subject at this uni" / "Wider subject at this uni", with
the CAH code in its tooltip, and the population and year underneath. Salaries
are never course-level. About 35-45% of NSS, continuation and entrant figures
are.

**The UK comparison** for each block is the median across providers for the
same CAH subject, mode and level, worked out at import, taking the most
specific subject level that has one. Each provider counts once, by the median
of its distinct rows; pooled rows repeat across every course they cover. Joint
courses' own figures are left out, since they belong to no single subject.
Fewer than five providers and no comparison is shown. The entrant-points
comparison is pooled instead, weighted by entrants. Salary uses HESA's own
published sector figures (`GOSECSAL`).

**Entrants' points.** HESA's tariff bands are 16 points wide from 96, the same
boundaries as the Entry column, so the chart colours each bar by its band. The
shares are of all entrants, and entrants with no points recorded are in no bar,
so some courses total well under 100: about 40 for St Andrews' joint degrees,
which report 86% entering with A-levels or Highers, so the gap is not simply
international qualifications. When the total is under 90 the panel gives the
missing share and works out the median among entrants with points.

**Choices made:**
- **Joint courses** can have a row per subject in a table; the one covering the
  most students is used.
- **The job list** is hidden below 20 graduates, where each 5%-rounded share is
  one or two people.
- **No subject names.** Discover Uni gives CAH codes only, HESA's site blocks
  scripted downloads of the code list, and names derived from course titles
  were too unreliable ("Diplôme de Pâtisserie"). Chips name the level instead.
- **NSS theme labels** (`T1`-`T7`) follow the standard NSS theme order:
  teaching, learning opportunities, assessment and feedback, academic support,
  organisation and management, learning resources, student voice. They do not
  recompute exactly from the individual questions, so they are worth checking
  against the HESA file specification if that is ever to hand.
- **No TEF ratings.** `TEFOutcome.csv` is empty in the current download.
- **No demographics.** Discover Uni has none at course level.

**Known weak spots.** St Andrews and Glasgow submit one page per subject, so
joint degrees link to a single-subject page. Discover Uni runs a cycle behind
(the 2025 dataset describes 2026-27 entry), so courses new in 2027 are missing.

**Unmatched rows** get a Google search scoped to the provider's domain instead,
shown as a dashed **FIND** button rather than **UNI**.

The local server loads the same dataset at startup and links live results too.

---

## Entry difficulty

The **Entry** column ranks how hard a course is to get into. It exists because
universities publish two incompatible things — `AAB` and `112 - 120 points`
cannot be compared as text — and both convert to UCAS tariff points, the scale
they already share.

A-level tariff: `A*`=56, `A`=48, `B`=40, `C`=32, `D`=24, `E`=16. So `AAA` is
144, `BBB` is 120, `CCC` is 96.

Six bands, with boundaries on recognisable grade equivalents rather than round
numbers:

| Band | Points | Roughly |
|---|---|---|
| Open | ≤ 95 | below CCC |
| Moderate | 96–111 | around CCC |
| Selective | 112–127 | around BBB |
| Competitive | 128–143 | around ABB |
| High | 144–159 | around AAA |
| Highest | 160+ | A*AA and above |

Sanity check across the snapshot: Cambridge lands entirely in High and Highest,
Oxford almost entirely High, while Teesside and Nottingham Trent sit in Open
and Moderate.

### Rules that are not obvious

**Ranges rank on their top figure.** Both `120 - 136 points` and
`AAB - ABB` sort, band and filter on the higher end (136, AAB). The lower
figure is usually a contextual-offer or access-route minimum that most
applicants do not qualify for, so the top is what a student needs to be sure
of a place. An earlier version used the minimum, or the midpoint for spreads of
40+ points, which made courses look easier than they are.

**Converted grades show the whole range.** A points range converts each end
to its nearest three-A-level equivalent and shows them highest first, the way
universities write grades: `120 - 136` displays as `~AAB–BBB`. When both ends
convert to the same grades, only one is shown.

**Conversions cap at A\*A\*A\* (168).** Higher tariffs assume a fourth A-level,
an EPQ or other qualifications, so they show as A\*A\*A\* with a tooltip note.

Values that are not grades (`See entry requirements`, 250 rows) score `null`
and show an empty band rather than a misleading one.


## D1 schema

`schema.sql`. One flat `courses` table — every field the UI filters or renders
is a column, so the Worker never parses JSON to answer a query.

Columns worth knowing:

- `rowid_key` — primary key, Algolia `objectID` (`courseId-year`).
- `tariff_text` — either `"112 - 120 points"` or grades `"AAB"`.
- `tariff_from` — source year when borrowed, `NULL` when current.
- `tariff_grades` — `1` when `tariff_text` holds grades, not points.
- `subjects` — keyword blob, truncated to 500 chars, used for `LIKE`.

Indexes cover the filters the UI actually issues: `(year, level)` always, then
provider / award level / region / mode / tariff.

### Why there is an index on the sort order

`idx_sort (year, level, provider_sort, title)` exists because D1 bills **rows
read**, not rows returned, and without it an unfiltered search read the whole
cycle to return 300 rows:

| | plan | time |
|---|---|---|
| without `idx_sort` | `idx_tariff` + `USE TEMP B-TREE FOR ORDER BY` | 37 ms |
| with `idx_sort` | `idx_sort`, no sort step | 1.3 ms |

The sort is the reason, not the filter. `ORDER BY provider_sort, title` had no
index to satisfy it, so SQLite picked any index that covered `year`+`level`,
then materialised and sorted the entire filtered set in a temp b-tree — which
`LIMIT 300` cannot short-circuit. 29,774 rows read per request, and again for
the `COUNT(*)`.

### A filter index must carry the sort columns too

`idx_sort` fixed the unfiltered search, but filtering made things *worse*. The
narrow `(year, level, award_level)` index matched rows fine and then lost the
sort order, so the whole match had to be sorted before `LIMIT 300` applied:

| Filter | Matches | Rows read, before | After |
|---|---|---|---|
| none | 29,774 | 601 | 601 |
| `award_level = Bach(hons)` | 22,480 (76%) | **44,961** | **601** |
| `study_mode = Part-time` | 905 (3%) | 15,755 | 601 |
| `region = Greater London` | 4,229 (14%) | 8,459 | 603 |
| `region = Scotland` | 3,690 (12%) | 7,381 | 601 |

Filtering by `Bach(hons)` read **more than the whole table** to return 300 rows,
and more than issuing no filter at all. The counter-intuitive part is that a
*less* selective filter costs more: it excludes little but still defeats the
sort. `Full-time` (97% of rows) was already cheap at 601, because the planner
kept `idx_sort` rather than switching.

The fix is `(year, level, <col>, provider_sort, title)` -- filter column first,
then the sort columns, so the scan stays ordered and `LIMIT` stops early:
`idx_sort_award`, `idx_sort_mode`, `idx_sort_region`.

These **replace** the narrow `(year, level, <col>)` indexes rather than adding to
them. Each old index is a prefix of its replacement, so the planner uses the
wider one and the facet `GROUP BY`s still get a covering index. Net cost ~5 MB
instead of ~8 MB. `migrate-sort-indexes.sql` applies this to an existing
database.

### ANALYZE is mandatory, not a nicety

`import-d1.js` appends `ANALYZE` after the FTS rebuild. Without the statistics
it writes, the planner has only guesses and picks `idx_sort` for *every* search,
including filtered ones where seeking `idx_provider` is far cheaper — a
single-provider search measured **16.3 ms instead of 0.9 ms**. Re-run it after
any bulk load; `migrate-indexes.sql` does it for a database loaded before this
change.

### No index on `title` alone

Deliberate. The only query touching `title` is `lower(title) LIKE '%term%'`,
which no index can serve — verified `SCAN courses` even for a prefix pattern.

### FTS5 is built but unused

`courses_fts` is rebuilt on every import; the Worker uses `LIKE` instead. This
is a deliberate trade-off, not an oversight. FTS is token-based, so a search for
`physics` matches 746 rows and misses *Astrophysics*, *Biophysics* and
*Astronomy, Space Science and Astrophysics*; the substring `LIKE` matches 848
and finds them. Switching would be faster (0.6 ms vs 51 ms) but would quietly
drop results. It costs 3.6 MB to carry.

### Ordering is deterministic

Searches order by `provider_sort, title, rowid_key`. The third term matters:
2,383 rows share a `(provider_sort, title)` with another row — the same course
at a different study mode or start date — and without a tiebreak their relative
order is undefined, so a row could move position between identical requests.

`meta` holds `snapshot_<year>_<level>` (ISO timestamp) and `rows_<year>_<level>`.

### provider_counts: computed once per import, not once per page load

The university picker calls `/api/providers` on every page view, before any
search has been run. Built from `courses` that is a `GROUP BY` over the whole
cycle -- **29,774 rows scanned to return 320** -- and `/api/meta`, which the
page also loads every time, full-scanned `courses` to list the cycles. Roughly
60,000 rows read before the user has done anything.

Neither answer changes until the data is reimported, so `import-d1.js` writes
them into `provider_counts (year, level, provider, count)` and the Worker reads
that instead:

| Endpoint | Rows read before | After |
|---|---|---|
| `/api/providers` | 29,774 | 320 |
| `/api/meta` cycles | 29,774 | 320 |

The table is filled by an `INSERT ... SELECT` in the generated SQL, so the
database derives it from the rows just inserted and it cannot drift from them.
`/api/meta` sums the same 320 rows rather than counting `courses`.

Two things to know about the fast path:

- **It only applies to year+level.** That is what the picker sends. A request
  narrowed by region, mode or qualification is not in the precomputed table and
  still groups live -- verified returning 21 providers for Scotland.
- **It falls back silently.** A database without the table, or with it empty,
  drops through to the original `GROUP BY`, so the Worker is safe to deploy
  before the table exists. Both cases tested and return identical results.

`migrate-provider-counts.sql` builds it for an existing database without a
re-import; it is idempotent and safe to re-run.

### Cost per page load

Opening the page, before any search, calls exactly two endpoints: `/api/meta`
and `/api/providers`. It does **not** call `/api/facets` -- that endpoint exists
and works, but nothing in `public/index.html` requests it, so its four
`GROUP BY`s cost nothing in practice. (They are issued with `Promise.all`
anyway, for whenever something does.)

Rows read, 2027 undergraduate:

| | Before | Now |
|---|---|---|
| `/api/meta` | 29,774 | 320 |
| `/api/providers` | 29,774 | 320 |
| **Page open, no search** | **~59,500** | **~640** |
| `/api/search` total count | 29,774 | 320 |
| `/api/search` row fetch | 29,774 | ~300 |
| **then an unfiltered search** | **~59,500** | **~620** |

The `total` count is served from `provider_counts` too, by the same rule: year,
level and provider only, since `providers` is an OR over the very column the
table is grouped on. Anything narrowed by region, mode, qualification or a
search term is counted live, because the table cannot answer it.

That count query carries one subtlety. `SUM` over no matching rows returns
`NULL`, which is indistinguishable from an empty table -- so counting the
cycle's rows in the same statement (`COUNT(*) AS have`) is what separates "this
provider has no courses" from "this table was never populated". Getting it wrong
made a filtered search report zero results on a database missing the table,
which looks like a working search rather than a broken one.

So an open-and-search went from roughly 119,000 rows read to about 1,200. D1's
free tier allows 5M/day, which was about 42 such visits and is now a few
thousand. `idx_sort` fixed the search half; `provider_counts` fixed the half
that ran before the user had done anything.

---

## Refreshing the snapshot

### Deploying code and refreshing data are separate things

`npm run deploy` does **not** touch the data. `wrangler.jsonc` only *binds* the
D1 database to the Worker; it carries no migrations and no seed step, and
`worker.js` never writes to D1 — it is read-only. So deploying ships code and
leaves the data exactly as it was.

Proof from the live site: the data imported on 2026-09-30 survived seven
deploys with its timestamp unchanged, and the 2026-10-01 refresh changed the
data without a deploy.

The data path is a separate, manual, three-step pipeline that runs **from your
machine**:

```
Algolia  --(1)-->  snapshot-2027.sql  --(2)-->  D1 (remote)  --(3)-->  Worker reads it
```

1. **`npm run snapshot`** queries Algolia and writes a local .sql file. It
   never contacts D1 or Cloudflare.
2. **`wrangler d1 execute --remote`** pushes that file into the live D1
   database over the API. This is the only step that changes production data.
3. The Worker picks it up on the next request. No deploy needed — the data is
   not baked into the bundle.

```
npm run snapshot -- --year 2027 --level Undergraduate --out snapshot-2027.sql
npx wrangler d1 execute ucasbuster --remote --file=snapshot-2027.sql
npm run deploy      # only if worker.js or public/ changed
```

A snapshot carries its own schema, so step 2 brings the indexes and the
`ANALYZE` with it. A database loaded *before* those were added needs the
one-off migration instead of a full re-import:

```
npx wrangler d1 execute ucasbuster --remote --file=migrate-indexes.sql
npx wrangler d1 execute ucasbuster --remote --file=migrate-provider-counts.sql
npx wrangler d1 execute ucasbuster --remote --file=migrate-sort-indexes.sql
npx wrangler d1 execute ucasbuster --remote --file=migrate-course-links.sql
npx wrangler d1 execute ucasbuster --remote --file=migrate-hesa.sql
```

Columns are the exception: a snapshot has no `CREATE TABLE` for `courses`, so
it cannot add them. `migrate-course-links.sql` must run before the first
snapshot that carries `ukprn`/`course_url`/`course_link`, and `migrate-hesa.sql`
before the first that carries `kis_key`, or every INSERT fails. To add links
and Discover Uni figures to the data already loaded, without re-querying
Algolia:

```
node courselinks.js --snapshot snapshot-2027.sql --out links-2027.sql
npx wrangler d1 execute ucasbuster --remote --file=links-2027.sql
```

A snapshot from before the `ukprn` column can only match on website domain and
misses providers such as Lancaster; the coverage report warns when that is the
case.

The .sql file is an intermediate artifact, gitignored and not in the repo
(~21 MB, 1,190 INSERT statements). Keeping it means a failed load can be
retried without re-querying Algolia.

Check the cost before committing to a run — one query, no writes:

```
npm run export -- --year 2027 --level Undergraduate --dry-run
```

There is no automation: no cron, no CI, no scheduled Worker. A refresh happens
only when someone runs those commands.

Roughly 500 Algolia queries, a few minutes. The floor is ~300 (29,781 rows at
100 per query, plus a provider list); the rest is per-provider sharding overhead
and the prior-year and legacy-grade lookups. Course data moves over weeks, so
monthly is plenty.

**Batch INSERTs small.** D1 rejects oversized statements with `SQLITE_TOOBIG`.
200 rows per statement fails; `import-d1.js` uses **25**, giving a 27 KB largest
statement. If you hit this after a data change, re-batch the existing `.sql`
file rather than re-querying Algolia — that is ~500 queries you do not need to
spend twice.

---

## snapshot vs bulk export

Both run `exporter.runExport()`, so they fetch identically. They differ after
that, and the difference matters:

| | `npm run snapshot` | `/export` |
|---|---|---|
| Writes | `.sql` for D1 | `.ndjson` / `.csv` in `exports/` |
| Scope | whole cycle, ~500 queries | filterable by provider |
| Entry requirements | **resolved** | raw index values |

That last row is the trap. `/export` writes `ucasTariff` as it comes, so every
grade-quoting university — UCL, Oxford, Cambridge — exports as `0,0`. Only
`import-d1.js` runs the prior-year and legacy-grade passes, so only the
snapshot carries `AAA`/`AAB` for those providers.

## CLI

```
npm start                      # local server on :8787
npm run export -- --year 2027   # bulk export to NDJSON
npm run snapshot -- --year 2027  # build a D1 .sql file
npm run deploy                   # wrangler deploy
```

`export.js` flags: `--year`, `--level`, `--query`, `--providers` (comma list),
`--out`, `--format` (`ndjson`|`csv`), `--pause` (ms between queries),
`--dry-run` (plan only, one query).

`--providers` matches by **substring** from the CLI but **exactly** from the
web UI (`opts.exact`). The UI sources names from the facet, so exact is right
there; the CLI is for typing `ucl,durham` by hand.

---

## Operational notes

**The local server is not a service.** Plain `node server.js`. It dies with its
terminal and does not survive a reboot. Nothing restarts it.

**Caching.** `server.js` caches by query params for 30 min (`CACHE_TTL_MS`),
max 500 entries, with in-flight deduplication so two identical concurrent
requests cost one upstream query. Check effectiveness with `/api/stats`.

**Rate limiting.** Algolia returns **429** under load and the body still parses
as JSON, so an unguarded caller swallows it and silently under-reports. This
cost a long debugging session where coverage sat at 65% and looked like a
sharding bug. Every query path now retries with exponential backoff on 429 and
5xx; `export.js` additionally gates concurrency.

**Cloudflare bot protection** blocks scripted access to `www.ucas.com` and
`/explore/api/*` with 403. The Algolia endpoint is not behind it.

**Credentials in shell commands.** Inlining the Algolia key in a command line
trips tooling that scans for credential exposure. Pass it via an environment
variable and put the request body in a file.

---

## Deployment

`wrangler.jsonc` — Worker `ucasbuster`, D1 binding `DB` (database `ucasbuster`),
static assets from `./public` bound as `ASSETS` with
`run_worker_first: ["/api/*"]` so API routes reach the Worker and everything
else is served as a file.

The site is **public, no authentication** — a deliberate choice. It serves only
data UCAS already publishes openly. Cloudflare Access can be put in front of it
if that changes.

Do not commit `.wrangler/` — it holds local account state.
