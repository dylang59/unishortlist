-- D1 schema for the UCAS course snapshot.
--
-- One row per course option, matching what the Algolia index returns with
-- distinct=0. Kept deliberately flat: every field the UI renders or filters
-- on is a column, so the Worker never parses JSON to answer a query.

DROP TABLE IF EXISTS courses;

CREATE TABLE courses (
  rowid_key     TEXT PRIMARY KEY,   -- objectID: courseId + '-' + year
  course_id     TEXT NOT NULL,
  year          TEXT NOT NULL,
  level         TEXT NOT NULL,      -- Undergraduate / Postgraduate
  title         TEXT NOT NULL,
  slug          TEXT,
  provider      TEXT NOT NULL,
  provider_sort TEXT,
  town          TEXT,
  region        TEXT,
  country       TEXT,
  postcode      TEXT,
  lat           REAL,
  lng           REAL,
  award         TEXT,
  award_full    TEXT,
  award_level   TEXT,               -- Bach(hons), IMD, Masters …
  study_mode    TEXT,
  duration      TEXT,
  start_date    TEXT,
  entry_points  TEXT,
  app_code      TEXT,
  tariff_min    INTEGER,
  tariff_max    INTEGER,
  tariff_text   TEXT,               -- "112 - 120 points", or grades "AAB"
  tariff_from   TEXT,               -- source year when borrowed, else NULL
  tariff_grades INTEGER DEFAULT 0,  -- 1 when tariff_text holds A-level grades
  subjects      TEXT,               -- keyword blob, used for LIKE filtering
  provider_url  TEXT,
  ucas_url      TEXT,
  ukprn         TEXT,               -- UK provider reference number
  course_url    TEXT,               -- university's own course page (Discover Uni)
  course_link   TEXT,               -- 'exact', or 'base' when matched on the
                                    -- base course of a variant; NULL if none
  kis_key       TEXT                -- the matched Discover Uni course,
                                    -- PUBUKPRN|UKPRN|KISCOURSEID|KISMODE
);

-- year+level scopes every query. Provider, award level, mode and region are
-- indexed further down, together with the sort columns.
CREATE INDEX idx_year_level      ON courses (year, level);
CREATE INDEX idx_tariff          ON courses (year, level, tariff_min);

-- Matches the ORDER BY every search issues, which is what lets LIMIT stop
-- early. Without it SQLite satisfies year+level from some other index and
-- then sorts the whole filtered set in a temp b-tree, so an unfiltered
-- search reads all 29,774 rows to return 300 -- and D1 bills rows read.
CREATE INDEX idx_sort            ON courses (year, level, provider_sort, title);

-- Same shape, for the four filters the UI can narrow by. A filter alone is
-- not enough: `idx_award_level` matched Bach(hons) fine but lost the sort
-- order, so the whole 22,480-row match had to be sorted before LIMIT 300
-- applied -- 44,961 rows read, worse than no filter at all. Carrying
-- provider_sort and title in the index keeps the scan ordered, so LIMIT
-- stops early here too.
--
-- These replace the narrower (year, level, <col>) indexes rather than adding
-- to them: a prefix of each of these, so the planner uses these instead, and
-- the facet GROUP BYs still get a covering index from them. Net cost ~5 MB.
-- For provider the gain is smaller (one provider has at most ~1,000 rows),
-- but the largest still read 2,715 rows to return 300 without it.
CREATE INDEX idx_sort_provider ON courses (year, level, provider, provider_sort, title);
CREATE INDEX idx_sort_award    ON courses (year, level, award_level, provider_sort, title);
CREATE INDEX idx_sort_mode     ON courses (year, level, study_mode, provider_sort, title);
CREATE INDEX idx_sort_region   ON courses (year, level, region, provider_sort, title);

-- There is deliberately no index on title alone: the search term is a
-- substring match, which no b-tree index can serve. courses_fts serves it.

-- Substring search over course title, provider and subject keywords.
--
-- The trigram tokenizer is what makes this usable: a token-based index finds
-- `physics` but misses Astrophysics, whereas trigram MATCH is a substring
-- match, case-insensitive, and returns the same rows as the `lower(...) LIKE`
-- it replaces. It reads ~4 rows per match instead of the whole cycle. Terms
-- under 3 characters cannot use it; the Worker falls back to LIKE for those.
-- import-d1.js recreates this in every snapshot, so the definitions must match.
DROP TABLE IF EXISTS courses_fts;
CREATE VIRTUAL TABLE courses_fts USING fts5(
  title, provider, subjects,
  content='courses',
  content_rowid='rowid',
  tokenize='trigram'
);

-- Per-cycle provider counts, precomputed at import.
--
-- /api/providers runs on every page load, before any search, and building
-- it from `courses` means a GROUP BY over the whole cycle -- 29,774 rows
-- scanned to return 320. The answer only changes when the data is
-- reimported, so compute it once there and let the Worker read 320 rows.
-- D1 bills rows read, so this is the difference that matters, not the
-- milliseconds.
DROP TABLE IF EXISTS provider_counts;
CREATE TABLE provider_counts (
  year     TEXT NOT NULL,
  level    TEXT NOT NULL,
  provider TEXT NOT NULL,
  count    INTEGER NOT NULL,
  PRIMARY KEY (year, level, provider)
);

-- Per-cycle counts for every combination of the four filters, precomputed at
-- import (~1,235 rows a cycle).
--
-- provider_counts cannot answer a search narrowed by qualification, mode or
-- region, so those were counted live: Bach(hons) alone read 22,478 rows for
-- one number. Summing the matching rows here gives the same answer for
-- reading the cycle's ~1,235. Missing values are stored as '' rather than
-- NULL, which WITHOUT ROWID requires of a key; a filter never asks for ''.
-- import-d1.js creates this if missing, so the definitions must match.
DROP TABLE IF EXISTS filter_counts;
CREATE TABLE filter_counts (
  year        TEXT NOT NULL,
  level       TEXT NOT NULL,
  provider    TEXT NOT NULL,
  award_level TEXT NOT NULL,
  study_mode  TEXT NOT NULL,
  region      TEXT NOT NULL,
  count       INTEGER NOT NULL,
  PRIMARY KEY (year, level, provider, award_level, study_mode, region)
) WITHOUT ROWID;

-- Discover Uni figures for the course panel, one JSON record per Discover Uni
-- course (see hesa.js for its shape). Read one row at a time, by key, when a
-- panel opens; many UCAS variants share one record, so it is not folded into
-- courses.
DROP TABLE IF EXISTS hesa;
CREATE TABLE hesa (
  kis_key TEXT PRIMARY KEY,
  data    TEXT NOT NULL
);

-- Snapshot bookkeeping, so the UI can say how fresh the data is.
DROP TABLE IF EXISTS meta;
CREATE TABLE meta (
  key   TEXT PRIMARY KEY,
  value TEXT
);
