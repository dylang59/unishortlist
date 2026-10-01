-- One-off migration for a D1 database loaded before provider_counts existed.
-- Builds the table from the rows already there, so no re-import is needed:
--
--   npx wrangler d1 execute ucasbuster --remote --file=migrate-provider-counts.sql
--
-- New snapshots carry this themselves (schema.sql defines the table and
-- import-d1.js fills it), so this is needed once.

CREATE TABLE IF NOT EXISTS provider_counts (
  year     TEXT NOT NULL,
  level    TEXT NOT NULL,
  provider TEXT NOT NULL,
  count    INTEGER NOT NULL,
  PRIMARY KEY (year, level, provider)
);

-- Rebuild from courses for every cycle present, so this is safe to re-run.
DELETE FROM provider_counts;
INSERT INTO provider_counts (year, level, provider, count)
SELECT year, level, provider, COUNT(*) FROM courses
GROUP BY year, level, provider;

ANALYZE;
