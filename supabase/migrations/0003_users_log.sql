-- Track user logins in Supabase so the Admin page shows all users,
-- not just those who logged in on the current browser.

create table if not exists public.users_log (
  email        text primary key,
  last_login   timestamptz not null default now(),
  login_count  int not null default 1
);

alter table public.users_log enable row level security;

drop policy if exists "users_log read"   on public.users_log;
drop policy if exists "users_log write"  on public.users_log;
drop policy if exists "users_log update" on public.users_log;
create policy "users_log read"   on public.users_log for select using (true);
create policy "users_log write"  on public.users_log for insert with check (true);
create policy "users_log update" on public.users_log for update using (true) with check (true);
