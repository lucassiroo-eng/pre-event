import type { CountryCode } from "./countryConfig";

import geoFR from "@/data/france-regions.geojson.json";
import geoES from "@/data/spain-regions.geojson.json";
import geoIT from "@/data/italy-regions.geojson.json";
import geoDE from "@/data/germany-regions.geojson.json";
import geoBR from "@/data/brazil-regions.geojson.json";
import geoPT from "@/data/portugal-regions.geojson.json";
import geoMX from "@/data/mexico-regions.geojson.json";

interface GeoFeature {
  properties: { code: string | number; nom: string };
}
interface GeoCollection {
  features: GeoFeature[];
}

const GEO_DATA: Partial<Record<CountryCode, GeoCollection>> = {
  fr: geoFR as unknown as GeoCollection,
  es: geoES as unknown as GeoCollection,
  it: geoIT as unknown as GeoCollection,
  de: geoDE as unknown as GeoCollection,
  br: geoBR as unknown as GeoCollection,
  pt: geoPT as unknown as GeoCollection,
  mx: geoMX as unknown as GeoCollection,
};

// country → (regionCode → regionName), built once and cached.
const cache: Partial<Record<string, Record<string, string>>> = {};

function lookupFor(country: string): Record<string, string> {
  const key = country.toLowerCase();
  if (cache[key]) return cache[key]!;
  const geo = GEO_DATA[key as CountryCode];
  const map: Record<string, string> = {};
  if (geo) {
    for (const f of geo.features) {
      map[String(f.properties.code)] = f.properties.nom;
    }
  }
  cache[key] = map;
  return map;
}

// Returns the human region name for a given country + region code,
// falling back to the raw code when unknown.
export function regionNameForCountry(country: string, code: string): string {
  if (!code || code === "unknown") return "—";
  return lookupFor(country)[code] ?? code;
}

export function regionCodesForCountry(country: string): Record<string, string> {
  return { ...lookupFor(country) };
}
