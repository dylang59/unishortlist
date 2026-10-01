-- Keeps the sort order for the three filters the UI can narrow by.
--
--   npx wrangler d1 execute ucasbuster --remote --file=migrate-sort-indexes.sql
--
-- Why: a filter-only index matched rows fine but lost ORDER BY, so the whole
-- match had to be sorted before LIMIT could apply. Filtering by Bach(hons)
-- read 44,961 rows to return 300 -- worse than no filter at all. Carrying
-- provider_sort and title in the index lets LIMIT stop early here too.
--
-- New snapshots carry this themselves (schema.sql), so this is needed once.

CREATE INDEX IF NOT EXISTS idx_sort_award
  ON courses (year, level, award_level, provider_sort, title);
CREATE INDEX IF NOT EXISTS idx_sort_mode
  ON courses (year, level, study_mode, provider_sort, title);
CREATE INDEX IF NOT EXISTS idx_sort_region
  ON courses (year, level, region, provider_sort, title);

-- Redundant now: each is a prefix of the matching index above, so the planner
-- uses the wider one, and the facet GROUP BYs still get a covering index.
DROP INDEX IF EXISTS idx_award_level;
DROP INDEX IF EXISTS idx_mode;
DROP INDEX IF EXISTS idx_region;

ANALYZE;
