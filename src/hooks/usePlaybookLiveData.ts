/**
 * Hook that provides Playbook data either from live Supabase computation
 * or from the static playbookData.ts fallback.
 *
 * Live flow:  Supabase strategy_companies + strategy_sasor → computePlaybook()
 * Static fallback: REGIONS / NATIONAL from playbookData.ts (when Supabase has no rows)
 */

import { useState, useEffect, useCallback, useRef } from "react";
import { REGIONS as STATIC_REGIONS, NATIONAL as STATIC_NATIONAL } from "@/lib/playbookData";
import {
  fetchStrategyCompanies,
  fetchSasorBreakdown,
  importStrategyCsv,
  importSasorCsv,
  type StrategyCompany,
  type SasorBreakdown,
} from "@/lib/strategyStore";
import { computePlaybook, type PlaybookLiveData } from "@/lib/playbookCompute";

export type DataSource = "static" | "live";

export interface UsePlaybookLiveDataResult {
  data: PlaybookLiveData;
  source: DataSource;
  status: "idle" | "loading" | "error" | "ready";
  error: string | null;
  rowCount: number;
  refresh: () => Promise<void>;
  importHubspotCsv: (file: File, onProgress?: (done: number, total: number) => void) => Promise<{ inserted: number; errors: number }>;
  importTamCsv: (file: File, onProgress?: (done: number, total: number) => void) => Promise<{ inserted: number; errors: number }>;
  rawCompanies: StrategyCompany[];
  sasorBreakdown: SasorBreakdown | null;
}

const STATIC_DATA: PlaybookLiveData = {
  regions: STATIC_REGIONS,
  national: STATIC_NATIONAL,
  tamBySector: {},
  tamBySize: {},
  bestPractices: [],
};

function parseCsvText(text: string): Record<string, string>[] {
  const lines = text.split("\n");
  if (lines.length < 2) return [];
  const parseRow = (line: string): string[] => {
    const result: string[] = [];
    let current = "";
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') {
        if (inQuotes && line[i + 1] === '"') { current += '"'; i++; }
        else inQuotes = !inQuotes;
      } else if (ch === "," && !inQuotes) {
        result.push(current.trim());
        current = "";
      } else {
        current += ch;
      }
    }
    result.push(current.trim());
    return result;
  };
  const headerLine = lines[0].replace(/^﻿/, "");
  const headers = parseRow(headerLine).map((h) => h.replace(/^"|"$/g, "").trim());
  const rows: Record<string, string>[] = [];
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    const values = parseRow(line);
    const row: Record<string, string> = {};
    headers.forEach((h, j) => { row[h] = values[j] ?? ""; });
    rows.push(row);
  }
  return rows;
}

async function readFileAsText(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => resolve(e.target?.result as string ?? "");
    reader.onerror = () => reject(new Error("Error leyendo el archivo"));
    reader.readAsText(file, "utf-8");
  });
}

export function usePlaybookLiveData(): UsePlaybookLiveDataResult {
  const [data, setData]         = useState<PlaybookLiveData>(STATIC_DATA);
  const [source, setSource]     = useState<DataSource>("static");
  const [status, setStatus]     = useState<"idle" | "loading" | "error" | "ready">("idle");
  const [error, setError]       = useState<string | null>(null);
  const [rowCount, setRowCount] = useState(0);
  const rawCompaniesRef         = useRef<StrategyCompany[]>([]);
  const sasorBreakdownRef       = useRef<SasorBreakdown | null>(null);
  // expose as state so consumers can react to changes
  const [rawCompanies, setRawCompanies]       = useState<StrategyCompany[]>([]);
  const [sasorBreakdown, setSasorBreakdown]   = useState<SasorBreakdown | null>(null);

  const load = useCallback(async () => {
    setStatus("loading");
    setError(null);
    try {
      const [companies, sasorData] = await Promise.all([
        fetchStrategyCompanies(),
        fetchSasorBreakdown(),
      ]);

      rawCompaniesRef.current = companies;
      sasorBreakdownRef.current = sasorData;
      setRawCompanies(companies);
      setSasorBreakdown(sasorData);

      if (!companies.length) {
        setData(STATIC_DATA);
        setSource("static");
        setRowCount(0);
      } else {
        const computed = computePlaybook(companies, sasorData);
        setData(computed);
        setSource("live");
        setRowCount(companies.length);
      }
      setStatus("ready");
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Error cargando datos de Supabase";
      setError(msg);
      setData(STATIC_DATA);
      setSource("static");
      setStatus("error");
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const importHubspotCsv = useCallback(
    async (file: File, onProgress?: (done: number, total: number) => void) => {
      const text = await readFileAsText(file);
      const rows = parseCsvText(text);
      const result = await importStrategyCsv(rows, onProgress);
      await load();
      return result;
    },
    [load],
  );

  const importTamCsv = useCallback(
    async (file: File, onProgress?: (done: number, total: number) => void) => {
      const text = await readFileAsText(file);
      const rows = parseCsvText(text);
      const result = await importSasorCsv(rows, onProgress);
      await load();
      return result;
    },
    [load],
  );

  return { data, source, status, error, rowCount, refresh: load, importHubspotCsv, importTamCsv, rawCompanies, sasorBreakdown };
}
