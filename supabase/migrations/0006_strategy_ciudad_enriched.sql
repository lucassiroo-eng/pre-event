alter table strategy_companies
  add column if not exists ciudad_enriched text,
  add column if not exists enriched_at timestamptz,
  add column if not exists enriched_source text; -- 'hubspot' | 'ai'

create index if not exists idx_strategy_ciudad_enriched
  on strategy_companies (ciudad_enriched)
  where ciudad_enriched is not null;
