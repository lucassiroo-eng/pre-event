-- Pre-Event shared state
-- Run this once in Supabase → SQL Editor.
-- Lets every authenticated user see the same wons + enrichment data,
-- instead of each browser having its own localStorage island.

create table if not exists public.deals (
  company_id        text primary key,
  company_name      text not null,
  country           text not null default 'fr',
  market            text default '',
  sector            text default '',
  total_actual_mrr  numeric default 0,
  total_cmrr        numeric default 0,
  seats             int default 0,
  lead_provenance   text default '',
  partner_name      text default '',
  plan_name         text default '',
  converted_at      text default '',
  deal_closed_date  text default '',
  company_owner     text default '',
  hubspot_team      text default '',
  region_code       text default 'unknown',
  city              text default '',
  updated_at        timestamptz default now()
);

create index if not exists deals_country_idx on public.deals (country);

create table if not exists public.enrichment (
  company_id    text primary key,
  company_name  text,
  hubspot_id    text,
  hubspot_city  text,
  hubspot_zip   text,
  domain        text,
  nps           text,
  sirene_city   text,
  sirene_postal text,
  sirene_siren  text,
  region_code   text default 'unknown',
  status        text default 'pending',
  enriched_at   timestamptz,
  error         text,
  updated_at    timestamptz default now()
);

create table if not exists public.csv_meta (
  id           int primary key default 1,
  uploaded_at  timestamptz,
  file_name    text,
  total_rows   int,
  countries    jsonb,
  constraint csv_meta_single_row check (id = 1)
);

-- RLS: app uses the anon key, so policies need to allow the anon role.
-- Admin gating is enforced in the client (auth.tsx ADMIN_EMAILS); this is an
-- internal tool, the threat model is "AE writes by accident", not "attacker".
alter table public.deals       enable row level security;
alter table public.enrichment  enable row level security;
alter table public.csv_meta    enable row level security;

-- deals
drop policy if exists "deals read"   on public.deals;
drop policy if exists "deals write"  on public.deals;
drop policy if exists "deals update" on public.deals;
drop policy if exists "deals delete" on public.deals;
create policy "deals read"   on public.deals for select using (true);
create policy "deals write"  on public.deals for insert with check (true);
create policy "deals update" on public.deals for update using (true) with check (true);
create policy "deals delete" on public.deals for delete using (true);

-- enrichment
drop policy if exists "enrichment read"   on public.enrichment;
drop policy if exists "enrichment write"  on public.enrichment;
drop policy if exists "enrichment update" on public.enrichment;
drop policy if exists "enrichment delete" on public.enrichment;
create policy "enrichment read"   on public.enrichment for select using (true);
create policy "enrichment write"  on public.enrichment for insert with check (true);
create policy "enrichment update" on public.enrichment for update using (true) with check (true);
create policy "enrichment delete" on public.enrichment for delete using (true);

-- meta
drop policy if exists "csv_meta read"   on public.csv_meta;
drop policy if exists "csv_meta write"  on public.csv_meta;
drop policy if exists "csv_meta update" on public.csv_meta;
create policy "csv_meta read"   on public.csv_meta for select using (true);
create policy "csv_meta write"  on public.csv_meta for insert with check (true);
create policy "csv_meta update" on public.csv_meta for update using (true) with check (true);
