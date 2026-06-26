-- New columns populated by the Starburst/Superset CSV export.
-- The frontend reads these first and only falls back to client-side resolution
-- when they are null.
alter table strategy_companies
  add column if not exists codigo_postal        text,
  add column if not exists has_demo             boolean,
  add column if not exists is_won               boolean,
  add column if not exists is_active_client     boolean,
  add column if not exists provenance_norm      text,
  add column if not exists size_segment         text,
  add column if not exists ccaa                 text;
