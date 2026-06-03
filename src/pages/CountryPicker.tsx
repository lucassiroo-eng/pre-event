import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Upload, ArrowRight } from "lucide-react";
import { readMeta, parseCsv, writeMeta, mergeDeals, countryStats, formatEUR } from "@/lib/csvStore";
import { useDeals } from "@/lib/useDeals";
import { getCountryConfig, applyCountryTheme, type CountryCode } from "@/lib/countryConfig";
import { useHideMrr } from "@/lib/useHideMrr";
import { setLocaleCountry, useT } from "@/lib/i18n";

const COUNTRY_KEY = "pre-event-country";

export function CountryPicker() {
  const navigate = useNavigate();
  const { deals, meta, loading, setDeals, refresh } = useDeals();
  const hideMrr = useHideMrr();
  const t = useT();
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const stats = useMemo(() => countryStats(deals), [deals]);
  const countries = useMemo(() => {
    return Object.entries(stats)
      .filter(([c]) => c !== "unknown" && c.length === 2)
      .sort((a, b) => b[1].count - a[1].count)
      .slice(0, 7);
  }, [stats]);

  const onFile = useCallback(async (file: File) => {
    setError(null);
    try {
      const text = await file.text();
      const parsed = parseCsv(text);
      if (parsed.length === 0) throw new Error("CSV vacío o sin company_name");
      const { merged } = mergeDeals(deals, parsed);
      setDeals(merged);
      const cs = countryStats(merged);
      writeMeta({
        uploadedAt: new Date().toISOString(),
        fileName: file.name,
        totalRows: merged.length,
        countries: Object.fromEntries(Object.entries(cs).map(([k, v]) => [k, v.count])),
      });
      refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error parseando CSV");
    }
  }, []);

  const selectCountry = (code: string) => {
    setLocaleCountry(code);                 // also persists to localStorage + emits
    applyCountryTheme(code as CountryCode);
    navigate("/overview");
  };

  useEffect(() => {
    const saved = window.localStorage.getItem(COUNTRY_KEY);
    if (saved) applyCountryTheme(saved as CountryCode);
  }, []);

  return (
    <div className="relative min-h-[calc(100vh-3rem)] overflow-hidden">
      {/* Soft brand backdrop — tinted radial glows, no SaaS-cream */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 -z-10"
        style={{
          background:
            "radial-gradient(900px 500px at 85% -10%, oklch(0.9 0.09 320 / 0.45), transparent 60%), " +
            "radial-gradient(700px 400px at 0% 100%, oklch(0.88 0.08 250 / 0.4), transparent 60%)",
        }}
      />

      <div className="mx-auto max-w-[1280px] px-6 pb-16 pt-10 lg:px-10 lg:pt-14">
        {/* Hero */}
        <div className="flex items-end justify-between gap-6">
          <div>
            <div className="text-[11px] font-bold uppercase tracking-[0.22em] text-muted-foreground">
              Factorial · {t("app.name")}
            </div>
            <h1 className="mt-2 text-5xl font-bold tracking-tight text-foreground sm:text-6xl">
              {t("picker.availableCountries")}
            </h1>
            <p className="mt-3 max-w-xl text-base text-muted-foreground">
              {t("app.subtitle")}
            </p>
          </div>
          {meta && (
            <div className="hidden text-right md:block">
              <div className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                {t("picker.lastFile")}
              </div>
              <div className="mt-0.5 max-w-[280px] truncate text-sm font-medium text-foreground">{meta.fileName}</div>
              <div className="text-xs text-muted-foreground tabular-nums">
                {meta.totalRows.toLocaleString()} {t("picker.companies")}
              </div>
            </div>
          )}
        </div>

        {/* Country cards */}
        {countries.length > 0 && (
          <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {countries.map(([code, s], i) => {
              const cfg = getCountryConfig(code);
              return (
                <button
                  key={code}
                  onClick={() => selectCountry(code)}
                  style={{ animationDelay: `${i * 50}ms` }}
                  className="group relative isolate overflow-hidden rounded-2xl border border-border bg-card p-5 text-left shadow-sm transition-all duration-300 hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-xl"
                >
                  {/* Hover wash tinted by the country's primary */}
                  <div
                    aria-hidden
                    className="pointer-events-none absolute inset-0 -z-10 opacity-0 transition-opacity duration-500 group-hover:opacity-100"
                    style={{
                      background:
                        `radial-gradient(220px 160px at 80% 0%, ${cfg.primary.replace("oklch(", "oklch(").replace(")", " / 0.18)")}, transparent 70%)`,
                    }}
                  />

                  <div className="flex items-start justify-between">
                    <div className="grid h-14 w-14 place-items-center rounded-2xl bg-muted/60 text-4xl leading-none shadow-inner">
                      {cfg.flag}
                    </div>
                    <ArrowRight className="h-4 w-4 -translate-x-1 text-muted-foreground opacity-0 transition-all duration-300 group-hover:translate-x-0 group-hover:text-primary group-hover:opacity-100" />
                  </div>

                  <div className="mt-4">
                    <div className="text-xl font-semibold tracking-tight text-foreground">{cfg.name}</div>
                    <div className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">{code}</div>
                  </div>

                  <div className="mt-5 flex items-end justify-between gap-4 border-t border-border pt-4">
                    <div>
                      <div className="text-3xl font-bold tabular-nums leading-none text-foreground">
                        {s.count.toLocaleString()}
                      </div>
                      <div className="mt-1 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                        {t("picker.wons")}
                      </div>
                    </div>
                    {!hideMrr && (
                      <div className="text-right">
                        <div className="text-base font-semibold tabular-nums leading-none text-foreground">
                          {formatEUR(s.mrr)}
                        </div>
                        <div className="mt-1 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                          {t("picker.mrrTotal")}
                        </div>
                      </div>
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        )}

        {/* CSV upload — secondary affordance, never overshadows the cards */}
        <div className="mt-8">
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              const f = e.dataTransfer.files?.[0];
              if (f) onFile(f);
            }}
            className="flex w-full items-center gap-3 rounded-2xl border border-dashed border-border bg-card/50 px-5 py-4 text-left text-sm transition-colors hover:border-primary/40 hover:bg-card"
          >
            <Upload className="h-4 w-4 shrink-0 text-muted-foreground" />
            <div className="flex-1">
              <div className="font-medium text-foreground">
                {meta ? t("picker.update") : t("picker.upload")}
              </div>
              <div className="text-xs text-muted-foreground">
                {t("picker.dropHint")} <span className="font-mono">company_name</span>.
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
          </button>
          {error && (
            <div className="mt-3 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive">
              {error}
            </div>
          )}
        </div>

        {!loading && deals.length === 0 && (
          <div className="mt-16 text-center text-muted-foreground">
            <p className="text-lg font-medium">{t("picker.noData")}</p>
            <p className="mt-1 text-sm">{t("picker.uploadCta")}</p>
          </div>
        )}
        {loading && (
          <div className="mt-16 text-center text-sm text-muted-foreground">{t("picker.loading")}</div>
        )}
      </div>
    </div>
  );
}
