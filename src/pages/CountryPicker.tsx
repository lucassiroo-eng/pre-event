import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Upload } from "lucide-react";
import { PageHeader } from "@/components/layout/PageHeader";
import { Card } from "@/components/ui/card";
import { readDeals, readMeta, parseCsv, writeDeals, writeMeta, mergeDeals, countryStats, formatEUR, type CsvMeta } from "@/lib/csvStore";
import { getCountryConfig, applyCountryTheme, type CountryCode } from "@/lib/countryConfig";

const COUNTRY_KEY = "pre-event-country";

export function CountryPicker() {
  const navigate = useNavigate();
  const [deals, setDeals] = useState(() => readDeals());
  const [meta, setMeta] = useState<CsvMeta | null>(() => readMeta());
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const stats = useMemo(() => countryStats(deals), [deals]);
  const countries = useMemo(() => {
    return Object.entries(stats)
      .filter(([c]) => c !== "unknown" && c.length === 2)
      .sort((a, b) => b[1].count - a[1].count);
  }, [stats]);

  const onFile = useCallback(async (file: File) => {
    setError(null);
    try {
      const text = await file.text();
      const parsed = parseCsv(text);
      if (parsed.length === 0) throw new Error("CSV vacío o sin company_name");
      const existing = readDeals();
      const { merged, newCount } = mergeDeals(existing, parsed);
      writeDeals(merged);
      const cs = countryStats(merged);
      const csvMeta: CsvMeta = {
        uploadedAt: new Date().toISOString(),
        fileName: file.name,
        totalRows: merged.length,
        countries: Object.fromEntries(Object.entries(cs).map(([k, v]) => [k, v.count])),
      };
      writeMeta(csvMeta);
      setDeals(merged);
      setMeta(csvMeta);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error parseando CSV");
    }
  }, []);

  const selectCountry = (code: string) => {
    window.localStorage.setItem(COUNTRY_KEY, code);
    applyCountryTheme(code as CountryCode);
    navigate("/overview");
  };

  useEffect(() => {
    const saved = window.localStorage.getItem(COUNTRY_KEY);
    if (saved) applyCountryTheme(saved as CountryCode);
  }, []);

  return (
    <div className="mx-auto max-w-[1200px] px-6 py-6 lg:px-8 lg:py-8">
      <PageHeader
        title="Pre-Event"
        subtitle="Selecciona un país para ver el dashboard de wons"
      />

      <div className="mt-6">
        <Card
          className="p-6 border-dashed cursor-pointer hover:bg-muted/30 transition-colors"
          onClick={() => fileRef.current?.click()}
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault();
            const f = e.dataTransfer.files?.[0];
            if (f) onFile(f);
          }}
        >
          <div className="flex items-center gap-3 text-sm">
            <Upload className="h-5 w-5 text-muted-foreground" />
            <div className="flex-1">
              <div className="font-medium">
                {meta ? "Actualizar CSV de wons" : "Sube el CSV de wons"}
              </div>
              <div className="text-xs text-muted-foreground">
                Drag & drop o click. Columna requerida: <span className="font-mono">company_name</span>.
                {meta && ` Último: ${meta.fileName} (${meta.totalRows.toLocaleString()} empresas)`}
              </div>
            </div>
          </div>
          <input
            ref={fileRef}
            type="file"
            accept=".csv,text/csv"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) onFile(f);
              e.target.value = "";
            }}
          />
        </Card>

        {error && (
          <div className="mt-3 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive">
            {error}
          </div>
        )}
      </div>

      {countries.length > 0 && (
        <div className="mt-8">
          <h2 className="mb-4 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
            Países disponibles ({countries.length})
          </h2>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {countries.map(([code, s]) => {
              const cfg = getCountryConfig(code);
              return (
                <button
                  key={code}
                  onClick={() => selectCountry(code)}
                  className="group rounded-xl border border-border bg-card p-5 text-left shadow-sm transition-all hover:shadow-md hover:border-primary/40"
                >
                  <div className="flex items-center gap-3">
                    <span className="text-3xl">{cfg.flag}</span>
                    <div>
                      <div className="text-base font-semibold text-foreground group-hover:text-primary transition-colors">
                        {cfg.name}
                      </div>
                      <div className="text-xs text-muted-foreground uppercase">{code}</div>
                    </div>
                  </div>
                  <div className="mt-4 grid grid-cols-2 gap-3">
                    <div>
                      <div className="text-2xl font-bold tabular-nums text-foreground">{s.count.toLocaleString()}</div>
                      <div className="text-[11px] text-muted-foreground">wons</div>
                    </div>
                    <div>
                      <div className="text-lg font-semibold tabular-nums text-foreground">{formatEUR(s.mrr)}</div>
                      <div className="text-[11px] text-muted-foreground">MRR total</div>
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {deals.length === 0 && (
        <div className="mt-12 text-center text-muted-foreground">
          <p className="text-lg font-medium">Sin datos</p>
          <p className="mt-1 text-sm">Sube un CSV para empezar</p>
        </div>
      )}
    </div>
  );
}
