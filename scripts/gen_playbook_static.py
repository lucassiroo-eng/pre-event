#!/usr/bin/env python3
"""
gen_playbook_static.py
Reads spain_companies_enriched_NEW.csv (from sales_deals gold table)
and generates playbookData.ts with frozen static data.

v2 changes (2026-06-30):
- Source: sales_deals (gold) + hubspot_companies + finance_fact_active_subscriptions
- New metrics: l2d (Lead-to-Demo), d2w (Demo-to-Won), l2w kept as active/pipeline
- Industry mapping updated for industry_type_translated values
- 70K companies (50K base + 20K with deals without product_company_id)
"""

import csv
import json
import math
import os
from collections import defaultdict

CSV_PATH = os.path.expanduser("~/Downloads/spain_companies_enriched_NEW.csv")
OUT_PATH = os.path.join(
    os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
    "src", "lib", "playbookData.ts"
)

# ──────────────────────────────────────────────
# Channel normalisation
# ──────────────────────────────────────────────
def norm_channel(r):
    pn = (r.get('partner_object_name') or '').strip().lower()
    if pn:
        if 'santander' in pn:
            return 'Santander'
        if 'telefon' in pn or 'movistar' in pn:
            return 'Telefónica'
        return 'Channel Partners'
    pnorm = r.get('provenance_norm') or r.get('provenance') or ''
    if 'Inbound' in pnorm:
        return 'Inbound'
    if 'Outbound' in pnorm:
        return 'Outbound'
    if 'Paid' in pnorm:
        return 'Paid'
    if 'Partner' in pnorm:
        return 'Channel Partners'
    return 'Others'

# ──────────────────────────────────────────────
# Industry mapping
# ──────────────────────────────────────────────
INDUSTRIA_MAP = {
    # ── New translated values (from sales_deals.industry_type_translated) ──
    'Consumer Goods': 'Distribución & Retail',
    'Industrial & Manufacturing': 'Industria & Manufactura',
    'Professional Services': 'Servicios Profesionales',
    'Technology & Telecommunications': 'Tecnología & Software',
    'Health & Pharma': 'Salud',
    'Education': 'Educación & Formación',
    'Energy & Utilities': 'Energía & Medioambiente',
    'Miscellaneous': 'Otros Servicios',
    'Public & Non-Profit Sectors': 'Otros Servicios',
    'Aerospace & Defence': 'Industria & Manufactura',
    # ── Old SCREAMING_SNAKE values (from hubspot_companies.company_industry) ──
    'CONSTRUCTION': 'Construcción & Inmobiliaria',
    'CIVIL_ENGINEERING': 'Construcción & Inmobiliaria',
    'BUILDING_MATERIALS': 'Construcción & Inmobiliaria',
    'REAL_ESTATE': 'Construcción & Inmobiliaria',
    'COMMERCIAL_REAL_ESTATE': 'Construcción & Inmobiliaria',
    'INFORMATION_TECHNOLOGY_AND_SERVICES': 'Tecnología & Software',
    'COMPUTER_SOFTWARE': 'Tecnología & Software',
    'INTERNET': 'Tecnología & Software',
    'COMPUTER_HARDWARE': 'Tecnología & Software',
    'COMPUTER_NETWORKING': 'Tecnología & Software',
    'COMPUTER_GAMES': 'Tecnología & Software',
    'COMPUTER_NETWORK_SECURITY': 'Tecnología & Software',
    'TELECOMMUNICATIONS': 'Tecnología & Software',
    'FOOD_BEVERAGES': 'Agroalimentario',
    'FOOD_PRODUCTION': 'Agroalimentario',
    'FARMING': 'Agroalimentario',
    'DAIRY': 'Agroalimentario',
    'FISHERY': 'Agroalimentario',
    'WINE_AND_SPIRITS': 'Agroalimentario',
    'SUPERMARKETS': 'Agroalimentario',
    'RESTAURANTS': 'Hostelería & Turismo',
    'HOSPITALITY': 'Hostelería & Turismo',
    'LEISURE_TRAVEL_TOURISM': 'Hostelería & Turismo',
    'RECREATIONAL_FACILITIES_AND_SERVICES': 'Hostelería & Turismo',
    'RETAIL': 'Distribución & Retail',
    'WHOLESALE': 'Distribución & Retail',
    'CONSUMER_GOODS': 'Distribución & Retail',
    'APPAREL_FASHION': 'Distribución & Retail',
    'LUXURY_GOODS_JEWELRY': 'Distribución & Retail',
    'FURNITURE': 'Distribución & Retail',
    'INDUSTRIAL_AUTOMATION': 'Industria & Manufactura',
    'MACHINERY': 'Industria & Manufactura',
    'MECHANICAL_OR_INDUSTRIAL_ENGINEERING': 'Industria & Manufactura',
    'ELECTRICAL_ELECTRONIC_MANUFACTURING': 'Industria & Manufactura',
    'AUTOMOTIVE': 'Industria & Manufactura',
    'CHEMICALS': 'Industria & Manufactura',
    'PLASTICS': 'Industria & Manufactura',
    'TEXTILES': 'Industria & Manufactura',
    'MINING_METALS': 'Industria & Manufactura',
    'PACKAGING_AND_CONTAINERS': 'Industria & Manufactura',
    'PAPER_FOREST_PRODUCTS': 'Industria & Manufactura',
    'GLASS_CERAMICS_CONCRETE': 'Industria & Manufactura',
    'PRINTING': 'Industria & Manufactura',
    'TRANSPORTATION_TRUCKING_RAILROAD': 'Transporte & Logística',
    'LOGISTICS_AND_SUPPLY_CHAIN': 'Transporte & Logística',
    'PACKAGE_FREIGHT_DELIVERY': 'Transporte & Logística',
    'MARITIME': 'Transporte & Logística',
    'AVIATION_AEROSPACE': 'Transporte & Logística',
    'AIRLINES_AVIATION': 'Transporte & Logística',
    'WAREHOUSING': 'Transporte & Logística',
    'HOSPITAL_HEALTH_CARE': 'Salud',
    'PHARMACEUTICALS': 'Salud',
    'BIOTECHNOLOGY': 'Salud',
    'MEDICAL_DEVICES': 'Salud',
    'HEALTH_WELLNESS_AND_FITNESS': 'Salud',
    'MEDICAL_PRACTICE': 'Salud',
    'MENTAL_HEALTH_CARE': 'Salud',
    'VETERINARY': 'Salud',
    'EDUCATION_MANAGEMENT': 'Educación & Formación',
    'HIGHER_EDUCATION': 'Educación & Formación',
    'PRIMARY_SECONDARY_EDUCATION': 'Educación & Formación',
    'E_LEARNING': 'Educación & Formación',
    'PROFESSIONAL_TRAINING_COACHING': 'Educación & Formación',
    'MANAGEMENT_CONSULTING': 'Servicios Profesionales',
    'LEGAL_SERVICES': 'Servicios Profesionales',
    'ACCOUNTING': 'Servicios Profesionales',
    'FINANCIAL_SERVICES': 'Servicios Profesionales',
    'INSURANCE': 'Servicios Profesionales',
    'MARKETING_AND_ADVERTISING': 'Servicios Profesionales',
    'HUMAN_RESOURCES': 'Servicios Profesionales',
    'STAFFING_AND_RECRUITING': 'Servicios Profesionales',
    'BUSINESS_SUPPLIES_AND_EQUIPMENT': 'Servicios Profesionales',
    'CONSUMER_SERVICES': 'Servicios Profesionales',
    'FACILITIES_SERVICES': 'Servicios Profesionales',
    'OUTSOURCING_OFFSHORING': 'Servicios Profesionales',
    'OIL_ENERGY': 'Energía & Medioambiente',
    'RENEWABLES_ENVIRONMENT': 'Energía & Medioambiente',
    'UTILITIES': 'Energía & Medioambiente',
    'ENVIRONMENTAL_SERVICES': 'Energía & Medioambiente',
    'NON_PROFIT_ORGANIZATION_MANAGEMENT': 'Otros Servicios',
    'INDIVIDUAL_FAMILY_SERVICES': 'Otros Servicios',
    'CIVIC_SOCIAL_ORGANIZATION': 'Otros Servicios',
    'GOVERNMENT_ADMINISTRATION': 'Otros Servicios',
    'ENTERTAINMENT': 'Otros Servicios',
    'MEDIA_PRODUCTION': 'Otros Servicios',
    'BROADCAST_MEDIA': 'Otros Servicios',
    'SPORTS': 'Otros Servicios',
}

def map_industria(raw):
    return INDUSTRIA_MAP.get((raw or '').strip(), 'Otros Servicios')

# ──────────────────────────────────────────────
# TAM, codes, archetypes
# ──────────────────────────────────────────────
TAM = {
    'Cataluña': 18190,
    'Comunidad de Madrid': 18900,
    'Andalucía': 11643,
    'Comunidad Valenciana': 9930,
    'Galicia': 4536,
    'Canarias': 3699,
    'País Vasco': 4906,
    'Castilla y León': 3287,
    'Región de Murcia': 3042,
    'Aragón': 2757,
    'Castilla-La Mancha': 2766,
    'Islas Baleares': 2524,
    'Extremadura': 1144,
    'Comunidad Foral de Navarra': 1369,
    'Principado de Asturias': 3200,
    'Cantabria': 923,
    'La Rioja': 625,
    'Ceuta': 59,
    'Melilla': 55,
}

CODES = {
    'Cataluña': 'CAT',
    'Comunidad de Madrid': 'MAD',
    'Andalucía': 'AND',
    'Comunidad Valenciana': 'VAL',
    'Galicia': 'GAL',
    'Canarias': 'CAN',
    'País Vasco': 'PVA',
    'Castilla y León': 'CYL',
    'Región de Murcia': 'MUR',
    'Aragón': 'ARA',
    'Castilla-La Mancha': 'CLM',
    'Islas Baleares': 'BAL',
    'Extremadura': 'EXT',
    'Comunidad Foral de Navarra': 'NAV',
    'Principado de Asturias': 'AST',
    'Cantabria': 'CNT',
    'La Rioja': 'LRI',
    'Ceuta': 'CEU',
    'Melilla': 'MEL',
}

ARCHETYPES = {
    'Comunidad de Madrid': 'partner-led',
    'Galicia': 'partner-led',
    'Castilla y León': 'partner-led',
    'Región de Murcia': 'partner-led',
    'Aragón': 'partner-led',
    'Castilla-La Mancha': 'partner-led',
    'Comunidad Foral de Navarra': 'partner-led',
    'Cantabria': 'partner-led',
    'La Rioja': 'partner-led',
    'Cataluña': 'outbound-responsive',
    'Comunidad Valenciana': 'outbound-responsive',
    'Canarias': 'outbound-responsive',
    'País Vasco': 'outbound-responsive',
    'Islas Baleares': 'outbound-responsive',
    'Extremadura': 'outbound-responsive',
    'Principado de Asturias': 'outbound-responsive',
    'Andalucía': 'multi-channel',
    'Ceuta': 'multi-channel',
    'Melilla': 'multi-channel',
}

CCAA_ALIASES = {
    'C. Foral de Navarra': 'Comunidad Foral de Navarra',
    'Navarra': 'Comunidad Foral de Navarra',
    'Illes Balears': 'Islas Baleares',
    'Murcia': 'Región de Murcia',
    'Asturias': 'Principado de Asturias',
    'Madrid': 'Comunidad de Madrid',
    'Valencia': 'Comunidad Valenciana',
}

NATIONAL_ARPU = 715  # reference for assessment

# ──────────────────────────────────────────────
# Helpers
# ──────────────────────────────────────────────
def safe_float(v):
    try:
        return float(v)
    except (TypeError, ValueError):
        return 0.0

def r0(v):
    """Round to 0 decimal places, return int."""
    return int(round(v))

def r1(v):
    """Round to 1 decimal place."""
    return round(v, 1)

def fmt_arpu(v):
    """Format arpu as integer with comma thousands."""
    return f"{r0(v):,}"

def escape_ts(s):
    """Escape a string for use inside a TypeScript double-quoted string."""
    s = s.replace('\\', '\\\\')
    s = s.replace('"', '\\"')
    return s

# ──────────────────────────────────────────────
# Load CSV
# ──────────────────────────────────────────────
print(f"Reading {CSV_PATH} …")
with open(CSV_PATH, newline='', encoding='utf-8') as f:
    reader = csv.DictReader(f)
    all_rows = list(reader)
print(f"  {len(all_rows):,} total rows")

# ──────────────────────────────────────────────
# Filter to Spain only (non-empty ccaa in our TAM dict)
# ──────────────────────────────────────────────
region_rows = defaultdict(list)   # ccaa -> all rows
for r in all_rows:
    ccaa = (r.get('ccaa') or '').strip()
    ccaa = CCAA_ALIASES.get(ccaa, ccaa)
    r['ccaa'] = ccaa
    if ccaa in TAM:
        region_rows[ccaa].append(r)

active_rows = defaultdict(list)   # ccaa -> active rows
won_rows = defaultdict(list)
for ccaa, rows in region_rows.items():
    for r in rows:
        if r.get('is_active_client', '').strip().lower() == 'true':
            active_rows[ccaa].append(r)
        if r.get('is_won', '').strip().lower() == 'true':
            won_rows[ccaa].append(r)

# ──────────────────────────────────────────────
# Build NATIONAL totals from CSV
# ──────────────────────────────────────────────
nat_active = sum(len(v) for v in active_rows.values())
nat_won = sum(len(v) for v in won_rows.values())
nat_hubspot = sum(len(v) for v in region_rows.values())
nat_demos = sum(
    1 for rows in region_rows.values()
    for r in rows if r.get('has_demo', '').strip().lower() == 'true'
)
nat_mrr = sum(
    safe_float(r.get('cmrr', 0))
    for rows in active_rows.values()
    for r in rows
)
nat_arpu = nat_mrr / nat_active if nat_active else 0
nat_tam = sum(TAM.values())
nat_penetration = r1(nat_active / nat_tam * 100) if nat_tam else 0
nat_l2w = r1(nat_active / nat_hubspot * 100) if nat_hubspot else 0
nat_l2d = r1(nat_demos / nat_hubspot * 100) if nat_hubspot else 0
nat_d2w = r1(nat_won / nat_demos * 100) if nat_demos else 0

# Partner MRR share (national)
nat_partner_mrr = sum(
    safe_float(r.get('cmrr', 0))
    for rows in active_rows.values()
    for r in rows
    if norm_channel(r) in ('Santander', 'Telefónica', 'Channel Partners')
)
nat_partner_mrr_share = r1(nat_partner_mrr / nat_mrr * 100) if nat_mrr else 0

print(f"  National: {nat_active:,} active, {nat_won:,} won, MRR={nat_mrr:,.0f}, ARPU={nat_arpu:,.0f}")

# ──────────────────────────────────────────────
# Build each region
# ──────────────────────────────────────────────
def build_region(ccaa):
    all_r = region_rows[ccaa]
    act_r = active_rows[ccaa]
    won_r = won_rows[ccaa]
    tam = TAM[ccaa]

    active_count = len(act_r)
    won_count = len(won_r)
    hubspot_count = len(all_r)
    demo_count = sum(1 for r in all_r if r.get('has_demo', '').strip().lower() == 'true')

    mrr = sum(safe_float(r.get('cmrr', 0)) for r in act_r)
    arpu = mrr / active_count if active_count else 0
    l2w = r1(active_count / hubspot_count * 100) if hubspot_count else 0
    l2d = r1(demo_count / hubspot_count * 100) if hubspot_count else 0
    d2w = r1(won_count / demo_count * 100) if demo_count else 0
    penetration = r1(active_count / tam * 100)
    mrr_per_tam = r1(mrr / tam)

    total_mrr = mrr  # for share calculations

    # ── Provenances ──────────────────────────────
    prov_act = defaultdict(list)   # channel -> active rows
    prov_won = defaultdict(list)   # channel -> won rows
    prov_demo = defaultdict(list)  # channel -> demo rows
    prov_all = defaultdict(list)   # channel -> all rows (pipeline)
    for r in act_r:
        prov_act[norm_channel(r)].append(r)
    for r in won_r:
        prov_won[norm_channel(r)].append(r)
    for r in all_r:
        ch = norm_channel(r)
        prov_all[ch].append(r)
        if r.get('has_demo', '').strip().lower() == 'true':
            prov_demo[ch].append(r)

    provenances = []
    all_channels = set(list(prov_act.keys()) + list(prov_all.keys()))
    for ch in sorted(all_channels):
        ch_act = prov_act.get(ch, [])
        ch_won = prov_won.get(ch, [])
        ch_demo = prov_demo.get(ch, [])
        ch_all = prov_all.get(ch, [])
        ch_mrr = sum(safe_float(r.get('cmrr', 0)) for r in ch_act)
        ch_arpu = ch_mrr / len(ch_act) if ch_act else 0
        ch_share = r1(ch_mrr / total_mrr * 100) if total_mrr else 0
        ch_pipeline = len(ch_all)
        ch_demos = len(ch_demo)
        ch_d2w = r1(len(ch_won) / ch_demos * 100) if ch_demos else None
        ch_l2w = r1(len(ch_act) / ch_pipeline * 100) if ch_pipeline else None
        provenances.append({
            'label': ch,
            'pipeline': ch_pipeline,
            'demos': ch_demos,
            'active': len(ch_act),
            'won': len(ch_won),
            'mrr': r0(ch_mrr),
            'mrrShare': ch_share,
            'arpu': r0(ch_arpu),
            'd2w': ch_d2w,
            'l2w': ch_l2w,
        })
    # Sort by mrr desc
    provenances.sort(key=lambda x: -x['mrr'])

    # ── Sizes ─────────────────────────────────────
    size_act = defaultdict(list)
    size_won = defaultdict(list)
    size_demo = defaultdict(list)
    size_all = defaultdict(list)
    for r in act_r:
        size_act[r.get('size_segment', 'Unknown') or 'Unknown'].append(r)
    for r in won_r:
        size_won[r.get('size_segment', 'Unknown') or 'Unknown'].append(r)
    for r in all_r:
        seg = r.get('size_segment', 'Unknown') or 'Unknown'
        size_all[seg].append(r)
        if r.get('has_demo', '').strip().lower() == 'true':
            size_demo[seg].append(r)

    sizes = []
    all_segs = set(list(size_act.keys()) + list(size_all.keys()))
    for seg in sorted(all_segs):
        seg_act = size_act.get(seg, [])
        seg_won = size_won.get(seg, [])
        seg_demo = size_demo.get(seg, [])
        seg_all = size_all.get(seg, [])
        seg_mrr = sum(safe_float(r.get('cmrr', 0)) for r in seg_act)
        seg_arpu = seg_mrr / len(seg_act) if seg_act else 0
        seg_share = r1(seg_mrr / total_mrr * 100) if total_mrr else 0
        seg_pipeline = len(seg_all)
        seg_demos = len(seg_demo)
        seg_d2w = r1(len(seg_won) / seg_demos * 100) if seg_demos else None
        seg_l2w = r1(len(seg_act) / seg_pipeline * 100) if seg_pipeline else None
        sizes.append({
            'label': seg,
            'pipeline': seg_pipeline,
            'demos': seg_demos,
            'active': len(seg_act),
            'won': len(seg_won),
            'mrr': r0(seg_mrr),
            'arpu': r0(seg_arpu),
            'd2w': seg_d2w,
            'l2w': seg_l2w,
            'mrrShare': seg_share,
        })
    sizes.sort(key=lambda x: -x['mrr'])

    # ── Industries ────────────────────────────────
    ind_act = defaultdict(list)
    ind_won = defaultdict(list)
    ind_demo = defaultdict(list)
    ind_all = defaultdict(list)
    for r in act_r:
        ind_act[map_industria(r.get('industria', ''))].append(r)
    for r in won_r:
        ind_won[map_industria(r.get('industria', ''))].append(r)
    for r in all_r:
        label = map_industria(r.get('industria', ''))
        ind_all[label].append(r)
        if r.get('has_demo', '').strip().lower() == 'true':
            ind_demo[label].append(r)

    industries_all = []
    all_industries = set(list(ind_act.keys()) + list(ind_all.keys()))
    for label in sorted(all_industries):
        i_act = ind_act.get(label, [])
        i_won = ind_won.get(label, [])
        i_demo = ind_demo.get(label, [])
        i_all = ind_all.get(label, [])
        ind_mrr = sum(safe_float(r.get('cmrr', 0)) for r in i_act)
        ind_arpu = ind_mrr / len(i_act) if i_act else 0
        i_pipeline = len(i_all)
        i_demos = len(i_demo)
        i_d2w = r1(len(i_won) / i_demos * 100) if i_demos else None
        i_l2w = r1(len(i_act) / i_pipeline * 100) if i_pipeline else None
        i_l2d = r1(i_demos / i_pipeline * 100) if i_pipeline else None
        industries_all.append({
            'label': label,
            'pipeline': i_pipeline,
            'demos': i_demos,
            'active': len(i_act),
            'won': len(i_won),
            'mrr': r0(ind_mrr),
            'arpu': r0(ind_arpu),
            'd2w': i_d2w,
            'l2w': i_l2w,
            'l2d': i_l2d,
        })
    industries_all.sort(key=lambda x: -x['mrr'])

    # Skip 'Otros Servicios' if 5+ named sectors exist
    named = [i for i in industries_all if i['label'] != 'Otros Servicios']
    if len(named) >= 5:
        industries = named[:8]
    else:
        industries = industries_all[:8]

    # ── Partners ──────────────────────────────────
    partner_act = defaultdict(list)
    for r in act_r:
        pn = (r.get('partner_object_name') or '').strip()
        if not pn:
            continue
        pn_l = pn.lower()
        if 'santander' in pn_l or 'telefon' in pn_l or 'movistar' in pn_l:
            continue
        partner_act[pn].append(r)

    partners = []
    for name, rows in partner_act.items():
        p_mrr = sum(safe_float(r.get('cmrr', 0)) for r in rows)
        partners.append({
            'name': name,
            'clients': len(rows),
            'mrr': r0(p_mrr),
        })
    partners.sort(key=lambda x: -x['mrr'])
    partners = partners[:10]

    # ── Strategy ──────────────────────────────────
    # Lead channel by MRR
    lead_ch = provenances[0] if provenances else None
    lead_channel = lead_ch['label'] if lead_ch else 'N/D'
    lead_mrr_share = lead_ch['mrrShare'] if lead_ch else 0
    lead_arpu = lead_ch['arpu'] if lead_ch else 0
    lead_channel_detail = (
        f"{lead_channel} lidera el mix de canales con {lead_mrr_share}% del MRR y ARPU de €{lead_arpu:,}."
    )

    # Partner share (Santander + Telefónica + Channel Partners)
    partner_channels = [p for p in provenances if p['label'] in ('Santander', 'Telefónica', 'Channel Partners')]
    partner_mrr_total = sum(p['mrr'] for p in partner_channels)
    partner_active_total = sum(p['active'] for p in partner_channels)
    partner_share = partner_mrr_total / total_mrr * 100 if total_mrr else 0
    partner_arpu = partner_mrr_total / partner_active_total if partner_active_total else 0

    # Direct channels
    direct_channels = [p for p in provenances if p['label'] not in ('Santander', 'Telefónica', 'Channel Partners')]
    direct_mrr = sum(p['mrr'] for p in direct_channels)
    direct_active = sum(p['active'] for p in direct_channels)
    direct_arpu = direct_mrr / direct_active if direct_active else 1

    ratio = partner_arpu / direct_arpu if direct_arpu else 0

    if partner_share > 40:
        partner_play = f"Motor clave — {partner_share:.0f}% del MRR regional"
    else:
        partner_play = f"{partner_share:.0f}% del MRR regional"

    partner_detail = (
        f"Los canales partner (Santander, Telefónica, Channel Partners) generan el "
        f"{partner_share:.0f}% del MRR con ARPU de €{r0(partner_arpu):,} "
        f"— {ratio:.1f}x el canal directo."
    )

    # Size focus
    top_size = sizes[0] if sizes else None
    size_focus = top_size['label'] if top_size else 'N/D'
    top_size_mrr_share = top_size['mrrShare'] if top_size else 0
    top_size_active = top_size['active'] if top_size else 0
    top_size_arpu = top_size['arpu'] if top_size else 0
    size_detail = (
        f"El segmento {size_focus} genera el {top_size_mrr_share}% del MRR regional "
        f"con {top_size_active} clientes (ARPU €{top_size_arpu:,})."
    )

    # ARPU assessment
    pct_diff = (arpu - NATIONAL_ARPU) / NATIONAL_ARPU * 100
    if abs(pct_diff) <= 10:
        arpu_assessment = f"€{r0(arpu):,} (en línea con nacional)"
    elif pct_diff > 0:
        arpu_assessment = f"€{r0(arpu):,} (+{abs(pct_diff):.0f}% sobre nacional)"
    else:
        arpu_assessment = f"€{r0(arpu):,} ({abs(pct_diff):.0f}% bajo nacional)"

    # Top size by ARPU
    top_size_by_arpu = sorted(sizes, key=lambda x: -x['arpu'])[0] if sizes else None
    arpu_detail = (
        f"La palanca de ARPU más directa es aumentar el mix de deals en "
        f"{top_size_by_arpu['label']} ({top_size_by_arpu['arpu']:,} ARPU)."
    ) if top_size_by_arpu else ""

    # Conversion assessment
    nat_d2w_high = 18.6
    nat_d2w_low = 15.0
    if d2w > nat_d2w_high:
        conv_suffix = "— por encima de la media nacional"
    elif d2w < nat_d2w_low:
        conv_suffix = "— por debajo de la media nacional"
    else:
        conv_suffix = ""
    conversion_assessment = (
        f"De cada 100 empresas que entran al funnel, {d2w:.1f} son hoy clientes activos{conv_suffix}."
    )

    # Industry focus
    top_ind = industries[0] if industries else None
    industry_focus = top_ind['label'] if top_ind else 'N/D'
    top_ind_active = top_ind['active'] if top_ind else 0
    top_ind_arpu = top_ind['arpu'] if top_ind else 0
    industry_detail = (
        f"{industry_focus} es el sector que más ingresos genera con "
        f"{top_ind_active} clientes activos y ARPU de €{top_ind_arpu:,}."
    )

    strategy = {
        'leadChannel': lead_channel,
        'leadChannelDetail': lead_channel_detail,
        'partnerPlay': partner_play,
        'partnerDetail': partner_detail,
        'sizeFocus': size_focus,
        'sizeDetail': size_detail,
        'arpuAssessment': arpu_assessment,
        'arpuDetail': arpu_detail,
        'conversionAssessment': conversion_assessment,
        'industryFocus': industry_focus,
        'industryDetail': industry_detail,
        'conclusion': '',
        'topActions': [],
    }

    return {
        'ccaa': ccaa,
        'code': CODES[ccaa],
        'archetype': ARCHETYPES[ccaa],
        'tam': tam,
        'hubspot': hubspot_count,
        'active': active_count,
        'won': won_count,
        'demos': demo_count,
        'mrr': r0(mrr),
        'arpu': r0(arpu),
        'l2d': l2d,
        'd2w': d2w,
        'l2w': l2w,
        'penetration': penetration,
        'mrrPerTam': mrr_per_tam,
        'provenances': provenances,
        'sizes': sizes,
        'industries': industries,
        'partners': partners,
        'strategy': strategy,
        'keyInsights': [],
        'openQuestions': [],
    }

# ──────────────────────────────────────────────
# Build all 19 regions
# ──────────────────────────────────────────────
regions = []
for ccaa in TAM.keys():
    print(f"  Building {ccaa} …")
    reg = build_region(ccaa)
    regions.append(reg)

# Sort by MRR desc
regions.sort(key=lambda x: -x['mrr'])

# ──────────────────────────────────────────────
# TypeScript type block (preserved exactly)
# ──────────────────────────────────────────────
TS_HEADER = '''\
// Static playbook data — generated from spain_companies_enriched_NEW.csv
// Source: sales_deals (gold) + hubspot_companies + finance_fact_active_subscriptions
// Do not edit manually — regenerate with gen_playbook_static.py

export interface RegionPlaybook {
  ccaa: string;
  code: string;
  archetype: "partner-led" | "outbound-responsive" | "multi-channel";
  tam: number;
  hubspot: number;
  active: number;
  won: number;
  demos: number;
  mrr: number;
  arpu: number;
  l2d: number;
  d2w: number;
  l2w: number;
  penetration: number;
  mrrPerTam: number;
  sizes: {
    label: string;
    pipeline: number;
    demos: number;
    active: number;
    won: number;
    mrr: number;
    arpu: number;
    d2w: number | null;
    l2w: number;
    mrrShare: number;
  }[];
  provenances: {
    label: string;
    pipeline: number;
    demos: number;
    active: number;
    won: number;
    mrr: number;
    mrrShare: number;
    arpu: number;
    d2w: number | null;
    l2w: number;
  }[];
  industries: {
    label: string;
    pipeline: number;
    demos: number;
    active: number;
    won: number;
    mrr: number;
    arpu: number;
    d2w: number | null;
    l2w: number | null;
    l2d: number | null;
  }[];
  partners: {
    name: string;
    clients: number;
    mrr: number;
  }[];
  strategy: {
    leadChannel: string;
    leadChannelDetail: string;
    partnerPlay: string;
    partnerDetail: string;
    sizeFocus: string;
    sizeDetail: string;
    arpuAssessment: string;
    arpuDetail?: string;
    conversionAssessment: string;
    industryFocus?: string;
    industryDetail?: string;
    conclusion?: string;
    topActions?: string[];
  };
  keyInsights: string[];
  openQuestions: string[];
  industryInsights?: string[];
  tamBySizeForRegion?: Record<string, number>;
  tamBySectorForRegion?: Record<string, number>;
  channelSizeCross?: Record<string, Record<string, { active: number; pipeline: number; mrr: number }>>;
  channelIndustryCross?: Record<string, Record<string, { active: number; pipeline: number; mrr: number }>>;
}
'''

# ──────────────────────────────────────────────
# Serialise a Python value to TypeScript literal
# ──────────────────────────────────────────────
def ts_val(v, indent=0):
    pad = '  ' * indent
    inner = '  ' * (indent + 1)
    if v is None:
        return 'null'
    if isinstance(v, bool):
        return 'true' if v else 'false'
    if isinstance(v, int):
        return str(v)
    if isinstance(v, float):
        # present floats without unnecessary trailing zeros
        if v == int(v) and not math.isnan(v):
            return str(int(v))
        return str(v)
    if isinstance(v, str):
        escaped = v.replace('\\', '\\\\').replace('"', '\\"')
        return f'"{escaped}"'
    if isinstance(v, list):
        if not v:
            return '[]'
        items = [f'{inner}{ts_val(i, indent + 1)}' for i in v]
        return '[\n' + ',\n'.join(items) + f',\n{pad}]'
    if isinstance(v, dict):
        if not v:
            return '{}'
        lines = []
        for k, val in v.items():
            k_str = f'"{k}"' if not k.isidentifier() else k
            lines.append(f'{inner}{k_str}: {ts_val(val, indent + 1)}')
        return '{\n' + ',\n'.join(lines) + f',\n{pad}}}'
    return str(v)

# ──────────────────────────────────────────────
# Build NATIONAL constant
# ──────────────────────────────────────────────
national_obj = {
    'tam': nat_tam,
    'hubspot': nat_hubspot,
    'active': nat_active,
    'won': nat_won,
    'demos': nat_demos,
    'mrr': r0(nat_mrr),
    'arpu': r0(nat_arpu),
    'l2d': nat_l2d,
    'd2w': nat_d2w,
    'l2w': nat_l2w,
    'penetration': nat_penetration,
    'partnerMrrShare': nat_partner_mrr_share,
}

# ──────────────────────────────────────────────
# Existing TAM_BY_SECTOR and TAM_BY_SIZE (keep as-is)
# ──────────────────────────────────────────────
TAM_BY_SECTOR = {
    'Industria & Manufactura': 12479,
    'Agroalimentario': 6165,
    'Distribución & Retail': 17241,
    'Transporte & Logística': 5785,
    'Hostelería & Turismo': 11581,
    'Energía & Medioambiente': 1649,
    'Construcción & Inmobiliaria': 9418,
    'Servicios Profesionales': 10381,
    'Tecnología & Software': 4492,
    'Educación & Formación': 3186,
    'Otros Servicios': 3546,
    'Salud': 4432,
}

TAM_BY_SIZE = {
    'M (51-200)': 22497,
    'S (20-50)': 55923,
    'XL (500+)': 4788,
    'L (201-500)': 5502,
}

# ──────────────────────────────────────────────
# Render TypeScript file
# ──────────────────────────────────────────────
def render_ts_object(name, obj, typ=''):
    body = ts_val(obj, indent=0)
    decl = f'export const {name}'
    if typ:
        decl += f': {typ}'
    return f'{decl} = {body};\n'

def render_ts_regions(regions_list):
    parts = ['export const REGIONS: RegionPlaybook[] = [']
    for reg in regions_list:
        parts.append('  ' + ts_val(reg, indent=1) + ',')
    parts.append('];\n')
    return '\n'.join(parts)

lines = [TS_HEADER]
lines.append(render_ts_object('NATIONAL', national_obj))
lines.append(render_ts_object('TAM_BY_SECTOR', TAM_BY_SECTOR, 'Record<string, number>'))
lines.append(render_ts_object('TAM_BY_SIZE', TAM_BY_SIZE, 'Record<string, number>'))
lines.append(render_ts_regions(regions))

output = '\n'.join(lines)

print(f"\nWriting to {OUT_PATH} …")
os.makedirs(os.path.dirname(OUT_PATH), exist_ok=True)
with open(OUT_PATH, 'w', encoding='utf-8') as f:
    f.write(output)

line_count = output.count('\n') + 1
print(f"Done — {line_count:,} lines written.")
