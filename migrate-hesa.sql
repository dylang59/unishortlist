-- One-off migration for a D1 database loaded before the Discover Uni panel
-- data existed. Run once, then load a snapshot (or a courselinks backfill),
-- which fills kis_key and the hesa table:
--
--   npx wrangler d1 execute ucasbuster --remote --file=migrate-hesa.sql
--   npx wrangler d1 execute ucasbuster --remote --file=snapshot-2027.sql
--
-- New databases get both from schema.sql. SQLite has no ADD COLUMN IF NOT
-- EXISTS, so the ALTER fails harmlessly with "duplicate column" if re-run.

CREATE TABLE IF NOT EXISTS hesa (
  kis_key TEXT PRIMARY KEY,
  data    TEXT NOT NULL
);
ALTER TABLE courses ADD COLUMN kis_key TEXT;
