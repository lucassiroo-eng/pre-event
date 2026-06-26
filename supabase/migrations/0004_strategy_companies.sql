-- Strategy companies table (ES-only dynamic pivot table)
-- One-time CSV import, used by the Strategy tab.

create table if not exists public.strategy_companies (
  id                     bigserial primary key,
  hubspot_company_id     text,
  product_company_id     text,
  company_name           text not null,
  stage                  text default '',
  pipeline               text default '',
  country                text default '',
  ciudad                 text default '',
  industria              text default '',
  empresa_size           int default 0,
  provenance             text default '',
  close_date             timestamptz,
  after_demo_date        timestamptz,
  tipo_empresa           text default '',
  partner_object_name    text default '',
  plan                   text default '',
  plan_name              text default '',
  addons                 text default '',
  item_names             text default '',
  cmrr                   numeric default 0,
  sub_id_status          text default '',
  sector                 text default '',
  total_seats            int default 0,
  lead_provenance        text default '',
  deal_closed_date       text default '',
  conversion             text default '',
  imported_at            timestamptz default now()
);

create index if not exists strat_country_idx on public.strategy_companies (country);
create index if not exists strat_tipo_idx on public.strategy_companies (tipo_empresa);
create index if not exists strat_industria_idx on public.strategy_companies (industria);

alter table public.strategy_companies enable row level security;

drop policy if exists "strat read"   on public.strategy_companies;
drop policy if exists "strat write"  on public.strategy_companies;
drop policy if exists "strat update" on public.strategy_companies;
drop policy if exists "strat delete" on public.strategy_companies;
create policy "strat read"   on public.strategy_companies for select using (true);
create policy "strat write"  on public.strategy_companies for insert with check (true);
create policy "strat update" on public.strategy_companies for update using (true) with check (true);
create policy "strat delete" on public.strategy_companies for delete using (true);
