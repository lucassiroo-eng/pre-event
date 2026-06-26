-- SASOR: total TAM Spain companies (just the count + breakdown for funnel header)
create table if not exists strategy_sasor (
  id                   serial primary key,
  hubspot_company_id   text,
  company_name         text,
  sector               text,
  size_segment         text,
  ccaa                 text,
  employees            int,
  imported_at          timestamptz default now()
);

-- meta: stores sasor_total so we can read it without counting 95k rows every time
create table if not exists strategy_meta (
  key   text primary key,
  value text,
  updated_at timestamptz default now()
);
