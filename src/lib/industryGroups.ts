// Group raw HubSpot industries into broader categories for filtering.
const RULES: { group: string; match: RegExp }[] = [
  { group: "Software & IT", match: /software|saas|computer|information technology|internet|cloud|cyber|data|developer|programming/i },
  { group: "Finance & Insurance", match: /financ|bank|insur|invest|capital|fintech|account/i },
  { group: "Healthcare & Life Sciences", match: /health|hospital|medical|pharma|biotech|life science|wellness|clinic/i },
  { group: "Retail & E-commerce", match: /retail|e-?commerce|consumer goods|apparel|fashion|luxury/i },
  { group: "Manufacturing & Industrial", match: /manufactur|industrial|machinery|automotive|aerospace|chemical|mining|metal/i },
  { group: "Construction & Real Estate", match: /construct|real estate|architect|building/i },
  { group: "Media & Marketing", match: /media|marketing|advertis|public relation|publish|broadcast|entertainment|music|film/i },
  { group: "Hospitality & Food", match: /hospital(?!.*health)|restaurant|food|beverage|travel|leisure|hotel|tourism/i },
  { group: "Transport & Logistics", match: /transport|logistic|shipping|supply chain|airline|warehous/i },
  { group: "Education", match: /educat|e-?learning|school|university|training|academic/i },
  { group: "Professional Services", match: /consult|legal|law|staffing|recruit|hr|human resources|accounting/i },
  { group: "Energy & Utilities", match: /energy|oil|gas|utility|utilities|renewable|solar|power/i },
  { group: "Non-profit & Public", match: /non[- ]?profit|government|public|ngo|association/i },
  { group: "Telecom", match: /telecom|telecommunication|wireless/i },
  { group: "Agriculture", match: /agricultur|farming|food production/i },
];

export function groupIndustry(industry: string | null | undefined): string {
  if (!industry || !industry.trim()) return "Unknown";
  for (const r of RULES) if (r.match.test(industry)) return r.group;
  return "Other";
}

// Tailwind class pairs (bg + text + ring) per industry group. Used for pill colors.
const GROUP_COLORS: Record<string, string> = {
  "Software & IT":              "bg-sky-100 text-sky-800 ring-sky-200",
  "Finance & Insurance":        "bg-emerald-100 text-emerald-800 ring-emerald-200",
  "Healthcare & Life Sciences": "bg-rose-100 text-rose-800 ring-rose-200",
  "Retail & E-commerce":        "bg-pink-100 text-pink-800 ring-pink-200",
  "Manufacturing & Industrial": "bg-amber-100 text-amber-900 ring-amber-200",
  "Construction & Real Estate": "bg-orange-100 text-orange-800 ring-orange-200",
  "Media & Marketing":          "bg-fuchsia-100 text-fuchsia-800 ring-fuchsia-200",
  "Hospitality & Food":         "bg-yellow-100 text-yellow-900 ring-yellow-200",
  "Transport & Logistics":      "bg-indigo-100 text-indigo-800 ring-indigo-200",
  "Education":                  "bg-violet-100 text-violet-800 ring-violet-200",
  "Professional Services":      "bg-teal-100 text-teal-800 ring-teal-200",
  "Energy & Utilities":         "bg-lime-100 text-lime-900 ring-lime-200",
  "Non-profit & Public":        "bg-cyan-100 text-cyan-800 ring-cyan-200",
  "Telecom":                    "bg-blue-100 text-blue-800 ring-blue-200",
  "Agriculture":                "bg-green-100 text-green-800 ring-green-200",
  "Other":                      "bg-slate-100 text-slate-700 ring-slate-200",
  "Unknown":                    "bg-muted text-muted-foreground ring-border",
};

export function industryColorClass(industry: string | null | undefined): string {
  const group = groupIndustry(industry);
  return GROUP_COLORS[group] ?? GROUP_COLORS["Other"];
}

