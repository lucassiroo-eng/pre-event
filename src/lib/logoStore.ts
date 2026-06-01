const LOGO_CACHE_KEY = "pre-event-logos-v1";
const CLIENT_ID = import.meta.env.VITE_BRANDFETCH_CLIENT_ID ?? "1id_n1gqX639u9z8SB8";

export type LogoCache = Record<string, string>; // domain → data URL

export function readLogoCache(): LogoCache {
  try {
    const raw = window.localStorage.getItem(LOGO_CACHE_KEY);
    return raw ? (JSON.parse(raw) as LogoCache) : {};
  } catch { return {}; }
}

function writeLogoCache(cache: LogoCache) {
  try {
    window.localStorage.setItem(LOGO_CACHE_KEY, JSON.stringify(cache));
  } catch {}
}

async function domainToDataUrl(domain: string): Promise<string | null> {
  const url = `https://cdn.brandfetch.io/${domain}/icon?c=${CLIENT_ID}`;
  try {
    const res = await fetch(url);
    if (!res.ok || res.status === 404) return null;
    const blob = await res.blob();
    if (!blob.type.startsWith("image/")) return null;
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result as string);
      reader.onerror = () => resolve(null);
      reader.readAsDataURL(blob);
    });
  } catch { return null; }
}

export async function fetchLogos(domains: string[]): Promise<LogoCache> {
  const cache = readLogoCache();
  const uncached = [...new Set(domains.filter((d) => d && !(d in cache)))];
  if (uncached.length === 0) return cache;

  const results = await Promise.all(uncached.map(async (domain) => ({
    domain,
    dataUrl: await domainToDataUrl(domain),
  })));

  for (const { domain, dataUrl } of results) {
    cache[domain] = dataUrl ?? ""; // empty string = "tried but no logo"
  }
  writeLogoCache(cache);
  return cache;
}
