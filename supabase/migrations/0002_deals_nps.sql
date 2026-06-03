-- Add NPS columns to deals, pulled straight from the wons CSV
-- (Factorial Superset export columns last_nps_*). Run this once in
-- Supabase → SQL Editor.

alter table public.deals add column if not exists nps          text;
alter table public.deals add column if not exists nps_score    numeric;
alter table public.deals add column if not exists nps_category text default '';
alter table public.deals add column if not exists nps_date     text default '';
