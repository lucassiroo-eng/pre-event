// Mock data for Factorial France Partner Dashboard
// Easy to swap with real HubSpot data later.

export type RegionCode =
  | "11" | "24" | "27" | "28" | "32" | "44" | "52"
  | "53" | "75" | "76" | "84" | "93" | "94";

export interface RegionMeta {
  code: RegionCode;
  name: string;
}

export const REGIONS: RegionMeta[] = [
  { code: "11", name: "Île-de-France" },
  { code: "24", name: "Centre-Val de Loire" },
  { code: "27", name: "Bourgogne-Franche-Comté" },
  { code: "28", name: "Normandie" },
  { code: "32", name: "Hauts-de-France" },
  { code: "44", name: "Grand Est" },
  { code: "52", name: "Pays de la Loire" },
  { code: "53", name: "Bretagne" },
  { code: "75", name: "Nouvelle-Aquitaine" },
  { code: "76", name: "Occitanie" },
  { code: "84", name: "Auvergne-Rhône-Alpes" },
  { code: "93", name: "Provence-Alpes-Côte d'Azur" },
  { code: "94", name: "Corse" },
];

export const VERTICALS = [
  "Healthcare", "Retail", "Construction", "Hospitality",
  "Services", "Manufacturing", "Non-profit", "Tech",
  "Education", "Logistics",
] as const;

export const PARTNERS = [
  "Deloitte", "EY", "KPMG", "Mazars",
  "PayFit Network", "Silae Partners", "Cegid", "Salesforce FR",
  "BPI France", "CCI Partners",
] as const;

export const OWNERS = [
  "Lucas Martin", "Emma Bernard", "Hugo Petit", "Léa Dubois",
  "Nathan Moreau", "Chloé Laurent", "Théo Simon", "Camille Robert",
] as const;

export const ICP_SEGMENTS = [
  { id: "icp-1", label: "50–200 employees · Multi-site · Manual HR", sizeMin: 50, sizeMax: 200 },
  { id: "icp-2", label: "100–500 employees · High recruitment volume", sizeMin: 100, sizeMax: 500 },
  { id: "icp-3", label: "50–300 employees · Shift planning / Time tracking", sizeMin: 50, sizeMax: 300 },
  { id: "icp-4", label: "200–1000 employees · Multi-country HR", sizeMin: 200, sizeMax: 1000 },
] as const;

export const DEAL_STAGES = [
  "Prospecting", "Qualified", "Demo Scheduled", "Demo Held",
  "Proposal Sent", "Negotiation", "Closed Won", "Closed Lost",
] as const;

export type DealStage = typeof DEAL_STAGES[number];

export interface Deal {
  id: string;
  hubspotId: string;
  dealName: string;
  company: string;
  contact: string;
  contactEmail: string;
  region: RegionCode;
  vertical: typeof VERTICALS[number];
  icpId: string;
  employees: number;
  amount: number;
  mrr: number;
  stage: DealStage;
  owner: string;
  partner?: string;
  source: string;
  createdAt: string;
  demoBookedAt?: string;
  demoHeldAt?: string;
  closedAt?: string;
  blitzCampaign?: string;
}

// Deterministic PRNG so mock data is stable across renders
function mulberry32(seed: number) {
  return function () {
    let t = (seed += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const rand = mulberry32(42);
const pick = <T>(arr: readonly T[]): T => arr[Math.floor(rand() * arr.length)];
const intBetween = (a: number, b: number) => Math.floor(rand() * (b - a + 1)) + a;

const COMPANY_PREFIXES = [
  "Groupe", "Maison", "Cabinet", "Société", "Atelier", "Studio",
  "Réseau", "Compagnie", "Holding", "Fabrique",
];
const COMPANY_NAMES = [
  "Lefèvre", "Durand", "Moreau", "Lambert", "Garnier", "Faure",
  "Roux", "Vincent", "Bertrand", "Henry", "Chevalier", "François",
  "Mercier", "Blanc", "Guerin", "Boyer", "Roche", "Vidal", "Marchand",
  "Lemoine", "Perrin", "Renault", "Picard", "Caron", "Riviere",
  "Bonnet", "Dupont", "Lefebvre", "Léger", "Marchal",
];
const FIRSTNAMES = ["Antoine", "Sophie", "Julien", "Camille", "Maxime", "Pauline", "Romain", "Sarah", "Pierre", "Marie", "Alexandre", "Élodie", "Nicolas", "Charlotte"];
const LASTNAMES = ["Martin", "Bernard", "Dubois", "Robert", "Richard", "Petit", "Durand", "Leroy", "Moreau", "Simon", "Laurent", "Lefebvre"];

function makeCompany() {
  return `${pick(COMPANY_PREFIXES)} ${pick(COMPANY_NAMES)}`;
}
function makeContact() {
  return `${pick(FIRSTNAMES)} ${pick(LASTNAMES)}`;
}

// Region performance weights (Île-de-France > big metros > rest)
const REGION_WEIGHT: Record<RegionCode, number> = {
  "11": 1.0, "84": 0.75, "93": 0.65, "75": 0.55, "76": 0.5,
  "44": 0.45, "52": 0.4, "32": 0.4, "53": 0.35, "28": 0.3,
  "24": 0.25, "27": 0.22, "94": 0.1,
};

function daysAgo(d: number): string {
  const t = new Date();
  t.setDate(t.getDate() - d);
  return t.toISOString();
}

function generateDeals(): Deal[] {
  const deals: Deal[] = [];
  let id = 1;
  for (const region of REGIONS) {
    const weight = REGION_WEIGHT[region.code];
    const count = Math.max(8, Math.round(60 * weight + intBetween(0, 10)));
    for (let i = 0; i < count; i++) {
      const stageRoll = rand();
      let stage: DealStage;
      if (stageRoll < 0.18) stage = "Closed Won";
      else if (stageRoll < 0.26) stage = "Closed Lost";
      else if (stageRoll < 0.45) stage = "Demo Scheduled";
      else if (stageRoll < 0.6) stage = "Demo Held";
      else if (stageRoll < 0.72) stage = "Proposal Sent";
      else if (stageRoll < 0.82) stage = "Negotiation";
      else if (stageRoll < 0.92) stage = "Qualified";
      else stage = "Prospecting";

      const icp = pick(ICP_SEGMENTS);
      const employees = intBetween(icp.sizeMin, icp.sizeMax);
      const mrr = intBetween(8, 60) * Math.max(1, Math.round(employees / 50)) * 10;
      const amount = mrr * 12;
      const created = intBetween(5, 280);
      const usePartner = rand() < 0.55;

      const demoBookedAt =
        stage !== "Prospecting" && stage !== "Qualified"
          ? daysAgo(Math.max(1, created - intBetween(2, 20)))
          : undefined;
      const demoHeldAt =
        stage === "Demo Held" || stage === "Proposal Sent" ||
        stage === "Negotiation" || stage === "Closed Won" || stage === "Closed Lost"
          ? daysAgo(Math.max(1, created - intBetween(5, 30)))
          : undefined;
      const closedAt = stage === "Closed Won" || stage === "Closed Lost"
        ? daysAgo(intBetween(1, Math.min(180, created)))
        : undefined;

      const company = makeCompany();
      const contact = makeContact();
      deals.push({
        id: `d-${id}`,
        hubspotId: `${1000000 + id}`,
        dealName: `${company} — Factorial`,
        company,
        contact,
        contactEmail: contact.toLowerCase().replace(" ", ".") + "@" + company.split(" ").slice(-1)[0].toLowerCase() + ".fr",
        region: region.code,
        vertical: pick(VERTICALS),
        icpId: icp.id,
        employees,
        amount,
        mrr,
        stage,
        owner: pick(OWNERS),
        partner: usePartner ? pick(PARTNERS) : undefined,
        source: usePartner ? "Partner" : pick(["Outbound", "Inbound", "Event", "Referral"]),
        createdAt: daysAgo(created),
        demoBookedAt,
        demoHeldAt,
        closedAt,
        blitzCampaign: rand() < 0.2 ? `Blitz ${["Q1", "Q2", "Q3"][intBetween(0, 2)]} 2026` : undefined,
      });
      id++;
    }
  }
  return deals;
}

export const DEALS: Deal[] = generateDeals();

export const LAST_SYNC = new Date().toISOString();

// --- helpers used across the app ---

export function regionName(code: RegionCode): string {
  return REGIONS.find((r) => r.code === code)?.name ?? "Unknown";
}

export function dealsByRegion(code: RegionCode) {
  return DEALS.filter((d) => d.region === code);
}

export function isClosedWon(d: Deal) {
  return d.stage === "Closed Won";
}
export function isDemoBooked(d: Deal) {
  return !!d.demoBookedAt;
}
export function isDemoHeld(d: Deal) {
  return !!d.demoHeldAt;
}

export function formatEUR(n: number): string {
  return new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(n);
}

export function formatDate(iso?: string): string {
  if (!iso) return "—";
  return new Intl.DateTimeFormat("fr-FR", { day: "2-digit", month: "short", year: "numeric" }).format(new Date(iso));
}

export function hubspotDealUrl(hubspotId: string): string {
  return `https://app.hubspot.com/contacts/000000/deal/${hubspotId}`;
}

export function icpLabel(id: string): string {
  return ICP_SEGMENTS.find((i) => i.id === id)?.label ?? id;
}
