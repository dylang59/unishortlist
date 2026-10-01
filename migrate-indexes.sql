-- One-off migration for an existing D1 database, bringing its indexes in line
-- with schema.sql without re-importing 29,774 rows.
--
-- New loads get this automatically (schema.sql + the ANALYZE that import-d1.js
-- now appends). Run this once against a database loaded before that change:
--
--   npx wrangler d1 execute ucasbuster --remote --file=migrate-indexes.sql

-- Serves the ORDER BY every search issues, so LIMIT can stop early instead of
-- reading the whole cycle into a temp b-tree to sort it.
CREATE INDEX IF NOT EXISTS idx_sort ON courses (year, level, provider_sort, title);

-- Unused: the only query touching title is `lower(title) LIKE '%term%'`,
-- which no index can serve.
DROP INDEX IF EXISTS idx_title;

-- Index statistics. Without these the planner picks idx_sort even when a
-- provider filter would be far cheaper. Re-run after any future bulk load.
ANALYZE;
