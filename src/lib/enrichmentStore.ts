import type { RegionCode } from "./csvStore";

const STORAGE_KEY = "pre-event-enrichment-v1";
const TRACKING_KEY = "pre-event-enrichment-tracking-v1";

export interface EnrichmentRecord {
  companyId: string;
  companyName: string;
  hubspotId: string | null;
  hubspotCity: string | null;
  hubspotZip: string | null;
  domain: string | null;
  sireneCity: string | null;
  sirenePostal: string | null;
  sireneSiren: string | null;
  regionCode: RegionCode | "unknown";
  status: "pending" | "hs-matched" | "sirene-enriched" | "no-match" | "error";
  enrichedAt: string | null;
  error: string | null;
}

export type EnrichmentStore = Record<string, EnrichmentRecord>;

export interface TrackingEntry {
  timestamp: string;
  type: "hubspot" | "sirene";
  batchSize: number;
  matched: number;
  errors: number;
}

export function readEnrichmentStore(): EnrichmentStore {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as EnrichmentStore) : {};
  } catch {
    return {};
  }
}

export function writeEnrichmentStore(store: EnrichmentStore) {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
  } catch { /* quota */ }
}

export function readTracking(): TrackingEntry[] {
  try {
    const raw = window.localStorage.getItem(TRACKING_KEY);
    return raw ? (JSON.parse(raw) as TrackingEntry[]) : [];
  } catch {
    return [];
  }
}

export function addTrackingEntry(entry: TrackingEntry) {
  const entries = readTracking();
  entries.unshift(entry);
  if (entries.length > 200) entries.length = 200;
  try {
    window.localStorage.setItem(TRACKING_KEY, JSON.stringify(entries));
  } catch { /* quota */ }
}

// API call counter
const API_CALLS_KEY = "pre-event-api-calls-v1";

export interface ApiCallLog {
  date: string;
  hubspot: number;
  sirene: number;
}

export function readApiCalls(): ApiCallLog[] {
  try {
    const raw = window.localStorage.getItem(API_CALLS_KEY);
    return raw ? (JSON.parse(raw) as ApiCallLog[]) : [];
  } catch {
    return [];
  }
}

function todayKey(): string {
  return new Date().toISOString().slice(0, 10);
}

export function recordApiCall(type: "hubspot" | "sirene", count = 1) {
  const logs = readApiCalls();
  const today = todayKey();
  let entry = logs.find((l) => l.date === today);
  if (!entry) {
    entry = { date: today, hubspot: 0, sirene: 0 };
    logs.unshift(entry);
  }
  entry[type] += count;
  if (logs.length > 90) logs.length = 90;
  try {
    window.localStorage.setItem(API_CALLS_KEY, JSON.stringify(logs));
  } catch { /* quota */ }
}

// PPT download history
const PPT_KEY = "pre-event-ppt-downloads-v1";

export interface PptDownload {
  timestamp: string;
  region: string;
  country: string;
  user: string;
  sections: string[];
}

export function readPptDownloads(): PptDownload[] {
  try {
    const raw = window.localStorage.getItem(PPT_KEY);
    return raw ? (JSON.parse(raw) as PptDownload[]) : [];
  } catch {
    return [];
  }
}

export function recordPptDownload(entry: PptDownload) {
  const downloads = readPptDownloads();
  downloads.unshift(entry);
  if (downloads.length > 500) downloads.length = 500;
  try {
    window.localStorage.setItem(PPT_KEY, JSON.stringify(downloads));
  } catch { /* quota */ }
}
