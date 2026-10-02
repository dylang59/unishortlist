-- One-off migration for a D1 database loaded before course links existed.
-- Adds the columns; the links themselves come from a backfill file, so no
-- re-import is needed:
--
--   npx wrangler d1 execute ucasbuster --remote --file=migrate-course-links.sql
--   node courselinks.js --snapshot snapshot-2027.sql --out links-2027.sql
--   npx wrangler d1 execute ucasbuster --remote --file=links-2027.sql
--
-- New snapshots carry these columns themselves (schema.sql defines them and
-- import-d1.js fills them). SQLite has no ADD COLUMN IF NOT EXISTS, so this
-- fails harmlessly with "duplicate column" if re-run.

ALTER TABLE courses ADD COLUMN ukprn TEXT;
ALTER TABLE courses ADD COLUMN course_url TEXT;
ALTER TABLE courses ADD COLUMN course_link TEXT;
