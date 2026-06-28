-- Enable RLS on strategy_sasor and strategy_meta + open policies (anon read/write)
alter table strategy_sasor enable row level security;

drop policy if exists "sasor read"   on strategy_sasor;
drop policy if exists "sasor write"  on strategy_sasor;
drop policy if exists "sasor delete" on strategy_sasor;

create policy "sasor read"   on strategy_sasor for select using (true);
create policy "sasor write"  on strategy_sasor for insert with check (true);
create policy "sasor delete" on strategy_sasor for delete using (true);

alter table strategy_meta enable row level security;

drop policy if exists "meta read"   on strategy_meta;
drop policy if exists "meta write"  on strategy_meta;
drop policy if exists "meta upsert" on strategy_meta;

create policy "meta read"   on strategy_meta for select using (true);
create policy "meta write"  on strategy_meta for insert with check (true);
create policy "meta upsert" on strategy_meta for update using (true) with check (true);
