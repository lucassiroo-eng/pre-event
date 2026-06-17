# Pre-Event — Claude session memory

Internal Factorial dashboard for visualizing won deals (CSV from Superset) on
a choropleth map per country (FR, ES, IT, DE, PT, BR, MX). React + Vite +
TypeScript + Tailwind + shadcn/ui, hosted on Vercel, backed by Supabase
(deals + enrichment + edge functions).

GitHub: `lucassiroo-eng/pre-event`. Deploy: Vercel (auto-deploy from `main`).

## Quick orientation

- **Entry**: `src/App.tsx` — AuthGate, DealsProvider, routes.
- **Routes**: `/` CountryPicker (landing), `/overview`, `/table` (Detail),
  `/enrichment`, `/admin`.
- **State**:
  - Country choice → `localStorage["pre-event-country"]` + i18n locale store.
  - Hide-MRR toggle → `src/lib/useHideMrr.ts` (external store via
    `useSyncExternalStore`).
  - Deals → IndexedDB cache (`src/lib/csvStore.ts`) + Supabase cloud
    mirror (`src/lib/cloudStore.ts`).
  - Enrichment → localStorage + Supabase mirror.
- **i18n** (`src/lib/i18n.ts`): in-house, locale derived from country
  (fr/es/it/de/pt → matching locale, br→pt, mx/ar→es, ch→fr, gb/us→en).
  Applied to Sidebar nav, TopBar, CountryPicker, Overview, Table, RegionDetail.
  Admin and Enrichment pages stay in mixed ES/EN (internal tools).

## Architecture decisions worth remembering

1. **localStorage auth** (`src/lib/auth.tsx`) — emails + djb2-hashed passwords,
   purely client-side. `ADMIN_EMAILS` hardcoded list. **Known security gap**:
   anyone can self-register with any `*@factorial.co` string; admin gate is
   client-only. Documented for future hardening — not addressed yet.
2. **Supabase RLS is wide open** (anon read/write/delete on `deals`,
   `enrichment`, `csv_meta`). Internal-tool tradeoff; needs hardening if the
   URL leaks. See "Security TODO" below.
3. **CSV is the source of truth** for NPS (`last_nps_score` bucketed:
   9-10 Promoter, 7-8 Passive, 0-6 Detractor). HubSpot edge function still
   exists as fallback. The `nps_label` HubSpot property is what the edge
   function reads.
4. **Region resolution** is country-aware via `regionNames.ts`,
   `postalToRegionByCountry.ts`, `cityToRegionByCountry.ts`. All countries
   resolve regions, not just France.

## Supabase setup (project `Preevent`, ref `dnfnqniaxsgxbaorgahe`)

- Tables (migrations in `supabase/migrations/`):
  - `deals` — full CSV, including NPS columns (`nps`, `nps_score`,
    `nps_category`, `nps_date`).
  - `enrichment` — HubSpot/SIRENE sync per company.
  - `csv_meta` — single-row pointer to last CSV upload.
- Edge function: `hubspot-lookup` (deployed manually via dashboard editor).
  - Secret: `HUBSPOT_PAT_TOKEN`.
  - Reads HubSpot property `nps_label` (mapped to `nps` in response).
  - Wide-open CORS (`*`) — TODO restrict to GH Pages origin.
- RLS: open to anon for all CRUD on the 3 tables.

## Env (`.env`, also in GitHub Actions secrets)

- `VITE_SUPABASE_URL=https://dnfnqniaxsgxbaorgahe.supabase.co`
- `VITE_SUPABASE_ANON_KEY=…`
- `VITE_BRANDFETCH_CLIENT_ID` optional (default `1id_n1gqX639u9z8SB8`).

## What's done

- ✅ Country picker as landing, flag button top-right to switch.
- ✅ TopBar with MRR toggle + flag pill (replaces sidebar MRR toggle).
- ✅ i18n by country (fr/es/it/de/pt/en).
- ✅ Real Portugal map (replaced placeholder boxes with simplified distrito
  polygons, 68 KB).
- ✅ RegionDetail compact, fits viewport (sticky aside, max-h-[100vh-6rem]).
- ✅ NPS pulled from CSV (`last_nps_score` → Promoter/Passive/Detractor),
  badge in Detail table. Drops silently if empty (no placeholder).
- ✅ Supabase shared state (deals + enrichment + csv_meta tables).
- ✅ CSV upload shows `+N nuevos · total Y` banner with errors surfaced.
- ✅ HubSpot edge function `hubspot-lookup` deployed (returns `nps`, `domain`,
  `hubspotId`, `city`, `zip`).
- ✅ Ad-hoc HubSpot lookup at slide-gen time for domain→logo fetch.

## Security TODO (decided, not done — user dismissed picker)

In rough priority order — pick when ready:

1. **Cerrar la RLS**: `select using (true)` stays open; switch insert/update/
   delete to a policy that requires either an admin-secret header or a Supabase
   Auth session. Easiest path: keep Postgres open for reads, move all writes
   behind a `write-deals` / `write-enrichment` edge function that validates an
   `X-ADMIN-SECRET` header.
2. **Auth real**: migrate `src/lib/auth.tsx` to Supabase Auth (magic link, dom
   restriction `*@factorial.co`). Lets RLS use `auth.uid()`. ~1-2h of work,
   touches `auth.tsx`, `Login.tsx`, all RLS policies.
3. **CORS**: restrict the edge function `Access-Control-Allow-Origin` from `*`
   to the GH Pages origin.
4. **Admin emails to env**: `import.meta.env.VITE_ADMIN_EMAILS` instead of
   hardcoded list, so adding admins doesn't need a redeploy.

## Open small improvements (not requested, just notes)

- Logos cached per-user (localStorage). Could move to Supabase Storage if we
  want team-wide cache.
- Periodic HubSpot/NPS sync via Supabase cron (not wired).
- Detail page (`/table`) page itself isn't translated as deeply as the others
  — most labels are, but the seats-bucket dropdown values stay numeric and
  filter labels are translated.

## Conventions

- **Commits**: one logical change per commit, longer body explains the "why".
  No emojis. Co-author trailer with Claude.
- **Spanish in user-facing strings**, English in code/comments.
- **No `cd` in Bash tool**, absolute paths preferred.
- **No node/npm available in this sandbox** — verifications happen post-deploy
  via the user.

## Active branch / recent commits

```
45f5cb5  NPS badge: drop the placeholder, just show the label when present
286be0d  Pull NPS straight from the wons CSV (last_nps_score)
01f7ea8  Surface CSV upload result with deal count and errors
aedbcdc  Shared state via Supabase: deals + enrichment + meta tables
44bb970  RegionDetail fits viewport + NPS placeholder badge
6e65830  Simplify vertical filter trigger to icon + value + chevron
146d096  Clean up vertical filter: kicker above + simple icon+value pill
b93bfa2  Unify vertical filter into a single wide pill trigger
e0fae33  Replace placeholder Portugal map with real distrito polygons
ca73d72  4-task pass: cleaner picker, fixed vertical dropdown, tighter detail
```
