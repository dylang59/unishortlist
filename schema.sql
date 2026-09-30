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
  ucas_url      TEXT
);

-- The filters the UI actually issues: year+level always, then provider,
-- award level, mode, region, and a text search over title/subjects.
CREATE INDEX idx_year_level      ON courses (year, level);
CREATE INDEX idx_provider        ON courses (year, level, provider);
CREATE INDEX idx_award_level     ON courses (year, level, award_level);
CREATE INDEX idx_region          ON courses (year, level, region);
CREATE INDEX idx_mode            ON courses (year, level, study_mode);
CREATE INDEX idx_title           ON courses (title);
CREATE INDEX idx_tariff          ON courses (year, level, tariff_min);

-- Full-text search over course title, provider and subject keywords.
DROP TABLE IF EXISTS courses_fts;
CREATE VIRTUAL TABLE courses_fts USING fts5(
  title, provider, subjects,
  content='courses',
  content_rowid='rowid'
);

-- Snapshot bookkeeping, so the UI can say how fresh the data is.
DROP TABLE IF EXISTS meta;
CREATE TABLE meta (
  key   TEXT PRIMARY KEY,
  value TEXT
);
