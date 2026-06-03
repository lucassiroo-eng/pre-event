import { useEffect, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowRight } from "lucide-react";
import { formatEUR, countryStats } from "@/lib/csvStore";
import { useDeals } from "@/lib/useDeals";
import { getCountryConfig, applyCountryTheme, type CountryCode } from "@/lib/countryConfig";
import { useHideMrr } from "@/lib/useHideMrr";
import { setLocaleCountry, useT } from "@/lib/i18n";

const COUNTRY_KEY = "pre-event-country";

export function CountryPicker() {
  const navigate = useNavigate();
  const { deals, loading } = useDeals();
  const hideMrr = useHideMrr();
  const t = useT();

  const stats = useMemo(() => countryStats(deals), [deals]);
  const countries = useMemo(() => {
    return Object.entries(stats)
      .filter(([c]) => c !== "unknown" && c.length === 2)
      .sort((a, b) => b[1].count - a[1].count)
      .slice(0, 7);
  }, [stats]);

  const selectCountry = (code: string) => {
    setLocaleCountry(code);
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

      <div className="mx-auto flex min-h-[calc(100vh-3rem)] max-w-[1280px] flex-col justify-center px-6 py-12 lg:px-10">
        {/* Hero */}
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

        {/* Country cards */}
        {countries.length > 0 && (
          <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {countries.map(([code, s]) => {
              const cfg = getCountryConfig(code);
              return (
                <button
                  key={code}
                  onClick={() => selectCountry(code)}
                  className="group relative isolate overflow-hidden rounded-2xl border border-border bg-card p-5 text-left shadow-sm transition-all duration-300 hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-xl"
                >
                  <div
                    aria-hidden
                    className="pointer-events-none absolute inset-0 -z-10 opacity-0 transition-opacity duration-500 group-hover:opacity-100"
                    style={{
                      background:
                        `radial-gradient(220px 160px at 80% 0%, ${cfg.primary.replace(")", " / 0.18)")}, transparent 70%)`,
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
