-- One-off migration for a D1 database loaded before the trigram search index,
-- filter_counts and idx_sort_provider existed. Builds all three from the rows
-- already there, so no re-import is needed:
--
--   npx wrangler d1 execute ucasbuster --remote --file=migrate-search-counts.sql
--
-- New databases get these from schema.sql, and every snapshot recreates the
-- search index and fills filter_counts itself, so this is needed once. Safe to
-- re-run. The Worker checks for the trigram index and filter_counts before
-- using them, so deploying it before this has run only costs reads.

-- Substring search. The old token-based index missed Astrophysics for
-- `physics`; trigram MATCH returns the same rows as the LIKE it replaces.
DROP TABLE IF EXISTS courses_fts;
CREATE VIRTUAL TABLE courses_fts USING fts5(
  title, provider, subjects,
  content='courses',
  content_rowid='rowid',
  tokenize='trigram'
);
INSERT INTO courses_fts(courses_fts) VALUES('rebuild');

-- Counts for searches narrowed by qualification, mode or region, so they are
-- summed from ~1,235 rows a cycle instead of counted over the cycle.
CREATE TABLE IF NOT EXISTS filter_counts (
  year        TEXT NOT NULL,
  level       TEXT NOT NULL,
  provider    TEXT NOT NULL,
  award_level TEXT NOT NULL,
  study_mode  TEXT NOT NULL,
  region      TEXT NOT NULL,
  count       INTEGER NOT NULL,
  PRIMARY KEY (year, level, provider, award_level, study_mode, region)
) WITHOUT ROWID;
DELETE FROM filter_counts;
INSERT INTO filter_counts (year, level, provider, award_level, study_mode, region, count)
SELECT year, level, provider, COALESCE(award_level,''), COALESCE(study_mode,''),
       COALESCE(region,''), COUNT(*)
FROM courses GROUP BY 1, 2, 3, 4, 5, 6;

-- Keeps a one-provider search in sort order, so LIMIT stops early. Replaces
-- idx_provider, which is a prefix of it.
CREATE INDEX IF NOT EXISTS idx_sort_provider
  ON courses (year, level, provider, provider_sort, title);
DROP INDEX IF EXISTS idx_provider;

ANALYZE;
