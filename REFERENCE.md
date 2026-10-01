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

The deployed snapshot holds **29,750** rows for 2027 undergraduate. The live
index reports **29,767** today. 17 rows in one day — universities edit listings
continuously. The header chip shows the snapshot date for exactly this reason;
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
| 2027 | 29,767 |
| 2026 | 24,177 |
| 2025 | 11,411 |

2027 is **fully published** — 319 providers in the snapshot, including UCL (453),
St Andrews, Glasgow and Liverpool.

### Rows are course *options*, not courses

With `distinct=0` the index returns one record per option — a course offered
full-time and part-time is two records, each carrying exactly one
`courseOptions` entry. Both `export.js` and `import-d1.js` read
`courseOptions[0]`, which is therefore lossless, not a shortcut.

The 2027 snapshot happens to have a unique `course_id` on every row (29,750
rows, 29,750 distinct ids) because almost everything is full-time only: 28,844
full-time against 906 part-time. Do not rely on that holding — it is a property
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
not a row count: **320** instead of **29,767** for 2027 undergraduate. It also
caps pagination. Every query this project issues sets `distinct=0`.

### 1,000 retrievable hits per query

`hitsPerPage` caps at **100**, and `nbPages` tops out at **10** — so any single
query yields at most 1,000 rows, silently, with no error. Paging a 29,750-row
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
provider / award level / region / mode / tariff. There is an FTS5 table
(`courses_fts`) rebuilt on import; the Worker currently uses `LIKE` instead,
which is fast enough at 30k rows.

`meta` holds `snapshot_<year>_<level>` (ISO timestamp) and `rows_<year>_<level>`.

---

## Refreshing the snapshot

### Deploying code and refreshing data are separate things

`npm run deploy` does **not** touch the data. `wrangler.jsonc` only *binds* the
D1 database to the Worker; it carries no migrations and no seed step, and
`worker.js` never writes to D1 — it is read-only. So deploying ships code and
leaves the data exactly as it was.

Proof from the live site: the data was imported once on 2026-09-30 19:40Z and
has survived seven deploys since, four of them on 2026-10-01, with its
timestamp unchanged.

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

The .sql file is an intermediate artifact, gitignored and not in the repo
(~21 MB, 1,190 INSERT statements). Keeping it means a failed load can be
retried without re-querying Algolia.

Check the cost before committing to a run — one query, no writes:

```
npm run export -- --year 2027 --level Undergraduate --dry-run
```

There is no automation: no cron, no CI, no scheduled Worker. A refresh happens
only when someone runs those commands.

Roughly 500 Algolia queries, a few minutes. The floor is ~300 (29,767 rows at
100 per query, plus a provider list); the rest is per-provider sharding overhead
and the prior-year and legacy-grade lookups. Course data moves over weeks, so
monthly is plenty.

**Batch INSERTs small.** D1 rejects oversized statements with `SQLITE_TOOBIG`.
200 rows per statement fails; `import-d1.js` uses **25**, giving a 27 KB largest
statement. If you hit this after a data change, re-batch the existing `.sql`
file rather than re-querying Algolia — that is 514 queries you do not need to
spend twice.

---

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
