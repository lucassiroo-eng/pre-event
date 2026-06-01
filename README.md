# Pre-Event — Factorial Sales Intelligence Dashboard

Internal tool for Factorial's sales team to analyse **won deals by country and region** before events and demos. Upload a HubSpot CSV export, enrich company locations, explore an interactive map, filter the deal table, and export per-region PPTX slides.

**GitHub:** `lucassiroo-eng/pre-event`
**Deploy:** GitHub Pages (auto on push to `main`)

---

## Stack

| Layer | Tech |
|---|---|
| Frontend | React 19 · Vite · TypeScript · Tailwind CSS v4 · shadcn/ui (Radix) |
| Maps | D3-geo + GeoJSON (7 countries) |
| Slides | pptxgenjs |
| Backend | Supabase Edge Functions (hubspot-lookup, sirene-lookup) |
| Storage | IndexedDB (deals) · localStorage (enrichment, meta, auth) |
| Auth | Custom email/password — @factorial.co domain only |
| CI/CD | GitHub Actions → GitHub Pages |

---

## Pages & Routes

| Route | Page | Description |
|---|---|---|
| `/` | CountryPicker | Upload CSV, select country to explore |
| `/overview` | Overview | Interactive map — wons & MRR per region |
| `/table` | Table | Filterable/sortable deal table |
| `/enrichment` | Enrichment | Company enrichment via HubSpot + SIRENE |
| `/admin` | Admin | Users, API call logs, PPT download history |

---

## Data Flow

```
HubSpot CSV export
       │
       ▼
parseCsv() → WonDeal[]
       │
       ▼
IndexedDB (idb.ts)
       │
       ├─▶ DealsProvider (useDeals.tsx) ──▶ all pages
       │
       └─▶ Enrichment pipeline
               │
               ├─ 1. HubSpot lookup   (batch 50, 3 parallel)
               │      Supabase fn: hubspot-lookup
               │      → city + zip → regionCode
               │
               └─ 2. SIRENE lookup    (batch 25, sequential — FR only)
                      Supabase fn: sirene-lookup
                      → city + postal + SIREN → regionCode
```

---

## CSV Format (required columns)

```
company_id, company_name, country, market, sector,
total_actual_mrr, total_cmrr, seats, lead_provenance,
partner_name, plan_name, converted_at, deal_closed_date,
company_owner, hubspot_team
```

`company_name` is the only required column. The CSV is de-duplicated by `company_id` on upload and merged with existing data (preserves enriched `regionCode`).

---

## Countries

### With interactive map (GeoJSON)
`fr` France · `es` España · `it` Italia · `de` Deutschland · `pt` Portugal · `br` Brasil · `mx` México

### Configured (no map)
`gb` · `ar` · `ch` · `us`

Each country has a dynamic **oklch theme** applied via CSS variables when selected.

---

## Key Source Files

```
src/
├── App.tsx                     # Router + auth guard + DealsProvider
├── pages/
│   ├── CountryPicker.tsx       # CSV upload + country selection
│   ├── Overview.tsx            # Map + region drill-down + slide export
│   ├── Table.tsx               # Filterable deal table (region/sector/partner/seats/quarter)
│   ├── Enrichment.tsx          # HubSpot + SIRENE enrichment UI
│   └── Admin.tsx               # Users / API calls / PPT download logs
├── lib/
│   ├── auth.tsx                # localStorage auth — @factorial.co only
│   ├── useDeals.tsx            # DealsProvider context — enrichment overlay on load
│   ├── csvStore.ts             # parseCsv · WonDeal type · IndexedDB persistence
│   ├── enrichmentStore.ts      # EnrichmentRecord · tracking · API call log · PPT download log
│   ├── generateSlide.ts        # pptxgenjs — per-region PPTX (map PNG + 3 data blocks)
│   ├── countryConfig.ts        # CountryConfig · oklch theming per country
│   ├── industryGroups.ts       # 15-group regex classifier + Tailwind color pills
│   ├── idb.ts                  # IndexedDB key-value wrapper
│   ├── frenchPostalToRegion.ts # FR postal code → region code
│   ├── frenchCityToRegion.ts   # FR city → region code
│   ├── postalToRegionByCountry.ts  # Multi-country postal lookup
│   └── cityToRegionByCountry.ts    # Multi-country city lookup
├── components/
│   ├── dashboard/
│   │   ├── CountryMap.tsx      # SVG map router — delegates to per-country map
│   │   ├── FranceMap.tsx       # France SVG choropleth (d3-geo)
│   │   └── RegionDetail.tsx    # Region side-panel + slide export trigger
│   └── layout/
│       ├── Sidebar.tsx
│       └── PageHeader.tsx
└── data/
    ├── france-regions.geojson.json
    ├── spain-regions.geojson.json
    ├── italy-regions.geojson.json
    ├── germany-regions.geojson.json
    ├── portugal-regions.geojson.json
    ├── brazil-regions.geojson.json
    └── mexico-regions.geojson.json
```

---

## Enrichment Details

### HubSpot Lookup (`/functions/v1/hubspot-lookup`)
- Input: array of company names
- Batch size: 50 · Parallelism: 3
- Output: `{ found, city, zip, hubspotId }` per name
- Region derived: postal code first, city fallback
- Status stored: `hs-matched` | `no-match` | `error`

### SIRENE Lookup (`/functions/v1/sirene-lookup`) — France only
- Input: array of company names
- Batch size: 25
- Output: `{ found, city, postalCode, siren }` per name
- Only runs on companies not yet resolved by HubSpot
- Status stored: `sirene-enriched`

Enrichment records persist in `localStorage` (key: `pre-event-enrichment-v1`) and are overlaid on deals at app load via `applyEnrichmentOverlay()`.

---

## PPTX Slide Export

Generated via `generateRegionSlide()` (`src/lib/generateSlide.ts`) using **pptxgenjs** (wide layout, 13.33 × 7.5 in).

**Slide structure:**
1. **Map panel (left)** — SVG screenshot of the selected region highlighted on the France map, converted to PNG via canvas
2. **Top 3 Secteurs** — industry, wons count, MRR
3. **Top Módulos contratados** — plan names contracted in those industries
4. **Top 3 Entreprises** — company name, industry, MRR

Downloads are logged in `localStorage` (user, region, country, sections, timestamp) and visible in the Admin page.

---

## Auth

- Email must end with `@factorial.co`
- Passwords hashed with djb2, stored in `localStorage` (`factorial.users.v1`)
- Session stored in `localStorage` (`factorial.session.email`)
- Admin access: `lucas.siroo@factorial.co`, `jonathan.bakikatula@factorial.co`

---

## Local Development

```bash
npm install
npm run dev        # http://localhost:5173
npm run build      # TypeScript check + Vite build → dist/
npm run lint
npm run format
```

**Environment variables** (`.env`):
```
VITE_SUPABASE_URL=https://<project>.supabase.co
VITE_SUPABASE_ANON_KEY=<anon-key>
```

Without Supabase env vars the enrichment buttons are disabled but the rest of the app works.

---

## Deploy

Push to `main` → GitHub Actions builds and deploys to GitHub Pages automatically.
The workflow copies `dist/index.html` → `dist/404.html` for SPA routing.

---

## French Regions (ISO 3166-2)

| Code | Region |
|---|---|
| 11 | Île-de-France |
| 24 | Centre-Val de Loire |
| 27 | Bourgogne-Franche-Comté |
| 28 | Normandie |
| 32 | Hauts-de-France |
| 44 | Grand Est |
| 52 | Pays de la Loire |
| 53 | Bretagne |
| 75 | Nouvelle-Aquitaine |
| 76 | Occitanie |
| 84 | Auvergne-Rhône-Alpes |
| 93 | Provence-Alpes-Côte d'Azur |
| 94 | Corse |
