import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const HS_TOKEN   = Deno.env.get("HUBSPOT_PAT_TOKEN") ?? "";
const SB_URL     = Deno.env.get("SUPABASE_URL") ?? "";
const SB_SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

const OWNER_ID        = "86980590"; // Irving SITA
const DEFAULT_SINCE   = "2026-06-09T00:00:00.000Z";
const EXCLUDE_COUNTRIES = new Set(["fr", "be", "france", "belgium", "belgique"]);

const HS = "https://api.hubapi.com";

// ── HubSpot helpers ──────────────────────────────────────────────────────────

async function hsGet(path: string) {
  const res = await fetch(`${HS}${path}`, {
    headers: { Authorization: `Bearer ${HS_TOKEN}` },
  });
  if (!res.ok) throw new Error(`HubSpot GET ${path} → ${res.status}`);
  return res.json();
}

async function hsSearch(payload: unknown) {
  const res = await fetch(`${HS}/crm/v3/objects/deals/search`, {
    method: "POST",
    headers: { Authorization: `Bearer ${HS_TOKEN}`, "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error(`HubSpot search → ${res.status}: ${await res.text()}`);
  return res.json();
}

// ── Fetch all deals for owner since a date ───────────────────────────────────

const DEAL_PROPS = [
  "hs_object_id", "dealname", "dealstage", "pipeline",
  "hs_deal_stage_probability", "amount", "hs_arr", "hs_mrr",
  "hubspot_owner_id", "createdate",
  "hs_v2_date_entered_current_stage",
  "closedate", "hs_closed_won_date",
  "notes_last_contacted", "notes_last_updated",
  "num_contacted_notes", "num_notes", "hs_lastmodifieddate",
  "engagements_last_meeting_booked", "notes_next_activity_date",
  "hs_analytics_source", "hs_analytics_source_data_1",
  "hs_analytics_source_data_2", "hs_latest_source",
  "hs_campaign", "closed_lost_reason",
];

async function fetchAllDeals(since: string): Promise<Record<string, string>[]> {
  const deals: Record<string, string>[] = [];
  let after: string | undefined;

  do {
    const payload: Record<string, unknown> = {
      filterGroups: [{ filters: [
        { propertyName: "hubspot_owner_id", operator: "EQ", value: OWNER_ID },
        { propertyName: "createdate", operator: "GTE", value: since },
      ]}],
      properties: DEAL_PROPS,
      limit: 100,
      ...(after ? { after } : {}),
    };
    const data = await hsSearch(payload);
    for (const d of data.results) deals.push(d);
    after = data.paging?.next?.after;
  } while (after);

  return deals;
}

// ── Associations ─────────────────────────────────────────────────────────────

async function getAssociated(dealId: string, type: "companies" | "contacts") {
  const data = await hsGet(`/crm/v3/objects/deals/${dealId}/associations/${type}`);
  return (data.results ?? []).map((r: { id: string }) => r.id) as string[];
}

// ── Map to DB row ─────────────────────────────────────────────────────────────

function toNum(v: string | null | undefined): number | null {
  if (!v) return null;
  const n = parseFloat(v);
  return isNaN(n) ? null : n;
}

function toInt(v: string | null | undefined): number | null {
  if (!v) return null;
  const n = parseInt(v, 10);
  return isNaN(n) ? null : n;
}

function toTs(v: string | null | undefined): string | null {
  return v ? new Date(v).toISOString() : null;
}

function daysBetween(a: string | null | undefined, b: string | null | undefined): number | null {
  if (!a || !b) return null;
  const ms = new Date(b).getTime() - new Date(a).getTime();
  return ms < 0 ? null : Math.floor(ms / 86_400_000);
}

interface LeadRow {
  hs_id: string;
  dealname: string | null;
  dealstage: string | null;
  pipeline: string | null;
  hs_deal_stage_probability: number | null;
  amount: number | null;
  hs_arr: number | null;
  hs_mrr: number | null;
  hubspot_owner_id: string | null;
  createdate: string | null;
  hs_v2_date_entered_current_stage: string | null;
  days_in_current_stage: number | null;
  closedate: string | null;
  hs_closed_won_date: string | null;
  last_contacted_at: string | null;
  notes_last_updated: string | null;
  num_contacted_notes: number | null;
  num_notes: number | null;
  hs_lastmodifieddate: string | null;
  engagements_last_meeting_booked: string | null;
  next_activity_date: string | null;
  source_channel: string | null;
  source_channel_data_1: string | null;
  source_channel_data_2: string | null;
  latest_source: string | null;
  source_campaign: string | null;
  lost_reason: string | null;
  contact_firstname: string | null;
  contact_lastname: string | null;
  contact_email: string | null;
  contact_jobtitle: string | null;
  contact_phone: string | null;
  company_name: string | null;
  company_country: string | null;
  company_industry: string | null;
  company_employees: number | null;
  company_city: string | null;
  company_website: string | null;
  company_lifecyclestage: string | null;
  source: string;
  synced_at: string;
}

function buildRow(
  deal: Record<string, string>,
  company: Record<string, string>,
  contact: Record<string, string>,
): LeadRow {
  const p = deal.properties as Record<string, string>;
  const cp = company ?? {};
  const ct = contact ?? {};

  return {
    hs_id:                            deal.id,
    dealname:                         p.dealname ?? null,
    dealstage:                        p.dealstage ?? null,
    pipeline:                         p.pipeline ?? null,
    hs_deal_stage_probability:        toNum(p.hs_deal_stage_probability),
    amount:                           toNum(p.amount),
    hs_arr:                           toNum(p.hs_arr),
    hs_mrr:                           toNum(p.hs_mrr),
    hubspot_owner_id:                 p.hubspot_owner_id ?? null,
    createdate:                       toTs(p.createdate),
    hs_v2_date_entered_current_stage: toTs(p.hs_v2_date_entered_current_stage),
    days_in_current_stage:            daysBetween(p.hs_v2_date_entered_current_stage, new Date().toISOString()),
    closedate:                        toTs(p.closedate),
    hs_closed_won_date:               toTs(p.hs_closed_won_date),
    last_contacted_at:                toTs(p.notes_last_contacted),
    notes_last_updated:               toTs(p.notes_last_updated),
    num_contacted_notes:              toInt(p.num_contacted_notes),
    num_notes:                        toInt(p.num_notes),
    hs_lastmodifieddate:              toTs(p.hs_lastmodifieddate),
    engagements_last_meeting_booked:  toTs(p.engagements_last_meeting_booked),
    next_activity_date:               toTs(p.notes_next_activity_date),
    source_channel:                   p.hs_analytics_source ?? null,
    source_channel_data_1:            p.hs_analytics_source_data_1 ?? null,
    source_channel_data_2:            p.hs_analytics_source_data_2 ?? null,
    latest_source:                    p.hs_latest_source ?? null,
    source_campaign:                  p.hs_campaign ?? null,
    lost_reason:                      p.closed_lost_reason ?? null,
    contact_firstname:                ct.firstname ?? null,
    contact_lastname:                 ct.lastname ?? null,
    contact_email:                    ct.email ?? null,
    contact_jobtitle:                 ct.jobtitle ?? null,
    contact_phone:                    ct.phone ?? null,
    company_name:                     cp.name ?? null,
    company_country:                  cp.country ?? null,
    company_industry:                 cp.industry ?? null,
    company_employees:                toInt(cp.numberofemployees),
    company_city:                     cp.city ?? null,
    company_website:                  cp.website ?? null,
    company_lifecyclestage:           cp.lifecyclestage ?? null,
    source:                           "inbound",
    synced_at:                        new Date().toISOString(),
  };
}

// ── Main handler ──────────────────────────────────────────────────────────────

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });

  try {
    const supabase = createClient(SB_URL, SB_SERVICE);

    // Optional: pull ?since= from query string, else use default
    const url = new URL(req.url);
    const since = url.searchParams.get("since") ?? DEFAULT_SINCE;

    // 1. Fetch all deals matching owner + date
    const deals = await fetchAllDeals(since);

    const rows: LeadRow[] = [];
    const excluded: string[] = [];

    for (const deal of deals) {
      // 2. Get associated companies
      const companyIds = await getAssociated(deal.id, "companies");

      let company: Record<string, string> = {};
      let skip = false;

      for (const cid of companyIds) {
        const data = await hsGet(
          `/crm/v3/objects/companies/${cid}?properties=name,country,industry,numberofemployees,city,website,lifecyclestage`
        );
        const cp = data.properties as Record<string, string>;
        const country = (cp.country ?? "").trim().toLowerCase();
        if (EXCLUDE_COUNTRIES.has(country)) {
          skip = true;
          break;
        }
        company = cp; // use first non-excluded company
      }

      if (skip) {
        excluded.push(deal.id);
        continue;
      }

      // 3. Get associated contact (first one only)
      let contact: Record<string, string> = {};
      const contactIds = await getAssociated(deal.id, "contacts");
      if (contactIds.length > 0) {
        const data = await hsGet(
          `/crm/v3/objects/contacts/${contactIds[0]}?properties=firstname,lastname,email,jobtitle,phone`
        );
        contact = data.properties as Record<string, string>;
      }

      rows.push(buildRow(deal, company, contact));
    }

    // 4. Upsert into leads table
    if (rows.length > 0) {
      const { error } = await supabase
        .from("leads")
        .upsert(rows, { onConflict: "hs_id" });

      if (error) throw new Error(`Supabase upsert: ${error.message}`);
    }

    return new Response(
      JSON.stringify({
        ok: true,
        since,
        total_fetched: deals.length,
        excluded_fr_be: excluded.length,
        synced: rows.length,
      }),
      { headers: { ...CORS, "Content-Type": "application/json" } }
    );
  } catch (err) {
    return new Response(
      JSON.stringify({ ok: false, error: String(err) }),
      { status: 500, headers: { ...CORS, "Content-Type": "application/json" } }
    );
  }
});
