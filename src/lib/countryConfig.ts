export type CountryCode = "fr" | "es" | "it" | "de" | "pt" | "br" | "mx" | "gb" | "ar" | "ch" | "us" | "other";

export interface CountryConfig {
  code: CountryCode;
  name: string;
  flag: string;
  hasMap: boolean;
  hue: number; // oklch hue for theming
  primary: string; // oklch primary color
}

const CONFIGS: Record<CountryCode, CountryConfig> = {
  fr: { code: "fr", name: "France", flag: "\u{1F1EB}\u{1F1F7}", hasMap: true, hue: 260, primary: "oklch(0.55 0.18 260)" },
  es: { code: "es", name: "España", flag: "\u{1F1EA}\u{1F1F8}", hasMap: false, hue: 25, primary: "oklch(0.6 0.22 25)" },
  it: { code: "it", name: "Italia", flag: "\u{1F1EE}\u{1F1F9}", hasMap: false, hue: 155, primary: "oklch(0.55 0.15 155)" },
  de: { code: "de", name: "Deutschland", flag: "\u{1F1E9}\u{1F1EA}", hasMap: false, hue: 55, primary: "oklch(0.6 0.15 55)" },
  pt: { code: "pt", name: "Portugal", flag: "\u{1F1F5}\u{1F1F9}", hasMap: false, hue: 145, primary: "oklch(0.55 0.18 145)" },
  br: { code: "br", name: "Brasil", flag: "\u{1F1E7}\u{1F1F7}", hasMap: false, hue: 135, primary: "oklch(0.6 0.18 135)" },
  mx: { code: "mx", name: "México", flag: "\u{1F1F2}\u{1F1FD}", hasMap: false, hue: 160, primary: "oklch(0.55 0.15 160)" },
  gb: { code: "gb", name: "United Kingdom", flag: "\u{1F1EC}\u{1F1E7}", hasMap: false, hue: 240, primary: "oklch(0.5 0.18 240)" },
  ar: { code: "ar", name: "Argentina", flag: "\u{1F1E6}\u{1F1F7}", hasMap: false, hue: 200, primary: "oklch(0.6 0.15 200)" },
  ch: { code: "ch", name: "Schweiz", flag: "\u{1F1E8}\u{1F1ED}", hasMap: false, hue: 15, primary: "oklch(0.6 0.2 15)" },
  us: { code: "us", name: "United States", flag: "\u{1F1FA}\u{1F1F8}", hasMap: false, hue: 230, primary: "oklch(0.55 0.18 230)" },
  other: { code: "other", name: "Other", flag: "\u{1F30D}", hasMap: false, hue: 0, primary: "oklch(0.5 0.05 0)" },
};

export function getCountryConfig(code: string): CountryConfig {
  const lower = code.toLowerCase() as CountryCode;
  return CONFIGS[lower] ?? CONFIGS.other;
}

export function allCountryConfigs(): CountryConfig[] {
  return Object.values(CONFIGS).filter((c) => c.code !== "other");
}

export function applyCountryTheme(code: CountryCode) {
  const cfg = CONFIGS[code] ?? CONFIGS.other;
  const root = document.documentElement;
  root.style.setProperty("--primary", cfg.primary);
  root.style.setProperty("--ring", cfg.primary);
  root.style.setProperty("--sidebar-primary", cfg.primary);
  root.style.setProperty("--sidebar-ring", cfg.primary);

  const h = cfg.hue;
  root.style.setProperty("--accent", `oklch(0.95 0.035 ${h})`);
  root.style.setProperty("--accent-foreground", `oklch(0.3 0.1 ${h})`);
  root.style.setProperty("--secondary", `oklch(0.97 0.018 ${h})`);
  root.style.setProperty("--sidebar-accent", `oklch(0.95 0.035 ${h})`);
  root.style.setProperty("--sidebar-accent-foreground", `oklch(0.3 0.1 ${h})`);

  root.style.setProperty("--map-0", `oklch(0.975 0.008 ${h})`);
  root.style.setProperty("--map-1", `oklch(0.94 0.05 ${h})`);
  root.style.setProperty("--map-2", `oklch(0.86 0.11 ${h})`);
  root.style.setProperty("--map-3", `oklch(0.77 0.17 ${h})`);
  root.style.setProperty("--map-4", `oklch(0.67 0.21 ${h})`);
  root.style.setProperty("--map-5", `oklch(0.56 0.22 ${h})`);

  root.style.setProperty("--gradient-factorial", `linear-gradient(135deg, oklch(0.74 0.19 ${h + 10}) 0%, oklch(0.6 0.23 ${h - 3}) 100%)`);
  root.style.setProperty("--shadow-pink", `0 10px 40px -10px oklch(0.67 0.21 ${h} / 0.35)`);
  root.style.setProperty("--shadow-pink-soft", `0 4px 24px -8px oklch(0.67 0.21 ${h} / 0.18)`);
}
