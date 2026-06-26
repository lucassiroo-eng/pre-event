// GICS-inspired industry standardization for ~150 HubSpot industries
const INDUSTRY_MAP: Record<string, string> = {
  // Technology & Software
  INFORMATION_TECHNOLOGY_AND_SERVICES: "Technology & Software",
  COMPUTER_SOFTWARE: "Technology & Software",
  COMPUTER_HARDWARE: "Technology & Software",
  COMPUTER_NETWORKING: "Technology & Software",
  COMPUTER_NETWORK_SECURITY: "Technology & Software",
  COMPUTER_GAMES: "Technology & Software",
  INTERNET: "Technology & Software",
  ONLINE_MEDIA: "Technology & Software",
  SEMICONDUCTORS: "Technology & Software",
  NANOTECHNOLOGY: "Technology & Software",
  WIRELESS: "Technology & Software",
  TELECOMMUNICATIONS: "Telecom & Media",
  BROADCAST_MEDIA: "Telecom & Media",
  MEDIA_PRODUCTION: "Telecom & Media",
  NEWSPAPERS: "Telecom & Media",
  PUBLISHING: "Telecom & Media",
  ANIMATION: "Telecom & Media",
  MOTION_PICTURES_AND_FILM: "Telecom & Media",
  MUSIC: "Telecom & Media",
  PERFORMING_ARTS: "Telecom & Media",
  ENTERTAINMENT: "Telecom & Media",
  PHOTOGRAPHY: "Telecom & Media",
  FINE_ART: "Telecom & Media",
  ARTS_AND_CRAFTS: "Telecom & Media",
  GRAPHIC_DESIGN: "Telecom & Media",
  DESIGN: "Telecom & Media",
  WRITING_AND_EDITING: "Telecom & Media",

  // Healthcare & Life Sciences
  HOSPITAL_HEALTH_CARE: "Healthcare & Life Sciences",
  HEALTH_WELLNESS_AND_FITNESS: "Healthcare & Life Sciences",
  MEDICAL_DEVICES: "Healthcare & Life Sciences",
  MEDICAL_PRACTICE: "Healthcare & Life Sciences",
  MENTAL_HEALTH_CARE: "Healthcare & Life Sciences",
  PHARMACEUTICALS: "Healthcare & Life Sciences",
  BIOTECHNOLOGY: "Healthcare & Life Sciences",
  VETERINARY: "Healthcare & Life Sciences",
  ALTERNATIVE_MEDICINE: "Healthcare & Life Sciences",

  // Financial Services & Insurance
  FINANCIAL_SERVICES: "Financial Services",
  BANKING: "Financial Services",
  INSURANCE: "Financial Services",
  INVESTMENT_MANAGEMENT: "Financial Services",
  INVESTMENT_BANKING: "Financial Services",
  CAPITAL_MARKETS: "Financial Services",
  VENTURE_CAPITAL_PRIVATE_EQUITY: "Financial Services",
  ACCOUNTING: "Financial Services",

  // Retail & Consumer
  RETAIL: "Retail & Consumer",
  CONSUMER_SERVICES: "Retail & Consumer",
  CONSUMER_GOODS: "Retail & Consumer",
  CONSUMER_ELECTRONICS: "Retail & Consumer",
  APPAREL_FASHION: "Retail & Consumer",
  LUXURY_GOODS_JEWELRY: "Retail & Consumer",
  COSMETICS: "Retail & Consumer",
  SPORTING_GOODS: "Retail & Consumer",
  FURNITURE: "Retail & Consumer",
  SUPERMARKETS: "Retail & Consumer",
  WHOLESALE: "Retail & Consumer",
  E_LEARNING: "Retail & Consumer",
  GAMBLING_CASINOS: "Retail & Consumer",

  // Hospitality & Tourism
  HOSPITALITY: "Hospitality & Tourism",
  RESTAURANTS: "Hospitality & Tourism",
  LEISURE_TRAVEL_TOURISM: "Hospitality & Tourism",
  RECREATIONAL_FACILITIES_AND_SERVICES: "Hospitality & Tourism",
  SPORTS: "Hospitality & Tourism",
  EVENTS_SERVICES: "Hospitality & Tourism",
  AIRLINES_AVIATION: "Hospitality & Tourism",

  // Construction & Real Estate
  CONSTRUCTION: "Construction & Real Estate",
  REAL_ESTATE: "Construction & Real Estate",
  COMMERCIAL_REAL_ESTATE: "Construction & Real Estate",
  BUILDING_MATERIALS: "Construction & Real Estate",
  ARCHITECTURE_PLANNING: "Construction & Real Estate",
  CIVIL_ENGINEERING: "Construction & Real Estate",
  FACILITIES_SERVICES: "Construction & Real Estate",
  GLASS_CERAMICS_CONCRETE: "Construction & Real Estate",

  // Manufacturing & Industrial
  INDUSTRIAL_AUTOMATION: "Manufacturing & Industrial",
  MECHANICAL_OR_INDUSTRIAL_ENGINEERING: "Manufacturing & Industrial",
  MACHINERY: "Manufacturing & Industrial",
  ELECTRICAL_ELECTRONIC_MANUFACTURING: "Manufacturing & Industrial",
  AUTOMOTIVE: "Manufacturing & Industrial",
  AVIATION_AEROSPACE: "Manufacturing & Industrial",
  DEFENSE_SPACE: "Manufacturing & Industrial",
  PLASTICS: "Manufacturing & Industrial",
  TEXTILES: "Manufacturing & Industrial",
  PRINTING: "Manufacturing & Industrial",
  PACKAGING_AND_CONTAINERS: "Manufacturing & Industrial",
  PAPER_FOREST_PRODUCTS: "Manufacturing & Industrial",
  CHEMICALS: "Manufacturing & Industrial",
  RAILROAD_MANUFACTURE: "Manufacturing & Industrial",
  SHIPBUILDING: "Manufacturing & Industrial",
  TOBACCO: "Manufacturing & Industrial",

  // Education & Training
  HIGHER_EDUCATION: "Education & Training",
  EDUCATION_MANAGEMENT: "Education & Training",
  PRIMARY_SECONDARY_EDUCATION: "Education & Training",
  PROFESSIONAL_TRAINING_COACHING: "Education & Training",
  LIBRARIES: "Education & Training",
  MUSEUMS_AND_INSTITUTIONS: "Education & Training",
  RESEARCH: "Education & Training",

  // Professional Services
  MANAGEMENT_CONSULTING: "Professional Services",
  LEGAL_SERVICES: "Professional Services",
  LAW_PRACTICE: "Professional Services",
  HUMAN_RESOURCES: "Professional Services",
  STAFFING_AND_RECRUITING: "Professional Services",
  MARKETING_AND_ADVERTISING: "Professional Services",
  PUBLIC_RELATIONS_AND_COMMUNICATIONS: "Professional Services",
  MARKET_RESEARCH: "Professional Services",
  TRANSLATION_AND_LOCALIZATION: "Professional Services",
  OUTSOURCING_OFFSHORING: "Professional Services",
  BUSINESS_SUPPLIES_AND_EQUIPMENT: "Professional Services",
  INFORMATION_SERVICES: "Professional Services",

  // Transportation & Logistics
  TRANSPORTATION_TRUCKING_RAILROAD: "Transportation & Logistics",
  LOGISTICS_AND_SUPPLY_CHAIN: "Transportation & Logistics",
  MARITIME: "Transportation & Logistics",
  PACKAGE_FREIGHT_DELIVERY: "Transportation & Logistics",
  WAREHOUSING: "Transportation & Logistics",
  IMPORT_AND_EXPORT: "Transportation & Logistics",

  // Energy & Utilities
  OIL_ENERGY: "Energy & Utilities",
  RENEWABLES_ENVIRONMENT: "Energy & Utilities",
  UTILITIES: "Energy & Utilities",
  MINING_METALS: "Energy & Utilities",
  ENVIRONMENTAL_SERVICES: "Energy & Utilities",

  // Food & Agriculture
  FOOD_BEVERAGES: "Food & Agriculture",
  FOOD_PRODUCTION: "Food & Agriculture",
  FARMING: "Food & Agriculture",
  DAIRY: "Food & Agriculture",
  FISHERY: "Food & Agriculture",
  RANCHING: "Food & Agriculture",
  WINE_AND_SPIRITS: "Food & Agriculture",

  // Public Sector & NGO
  GOVERNMENT_ADMINISTRATION: "Public Sector & NGO",
  NON_PROFIT_ORGANIZATION_MANAGEMENT: "Public Sector & NGO",
  CIVIC_SOCIAL_ORGANIZATION: "Public Sector & NGO",
  RELIGIOUS_INSTITUTIONS: "Public Sector & NGO",
  POLITICAL_ORGANIZATION: "Public Sector & NGO",
  INTERNATIONAL_AFFAIRS: "Public Sector & NGO",
  INTERNATIONAL_TRADE_AND_DEVELOPMENT: "Public Sector & NGO",
  GOVERNMENT_RELATIONS: "Public Sector & NGO",
  PUBLIC_SAFETY: "Public Sector & NGO",
  PUBLIC_POLICY: "Public Sector & NGO",
  LAW_ENFORCEMENT: "Public Sector & NGO",
  JUDICIARY: "Public Sector & NGO",
  MILITARY: "Public Sector & NGO",
  PHILANTHROPY: "Public Sector & NGO",
  FUND_RAISING: "Public Sector & NGO",
  THINK_TANKS: "Public Sector & NGO",
  INDIVIDUAL_FAMILY_SERVICES: "Public Sector & NGO",
  PROGRAM_DEVELOPMENT: "Public Sector & NGO",
  EXECUTIVE_OFFICE: "Public Sector & NGO",
  ALTERNATIVE_DISPUTE_RESOLUTION: "Public Sector & NGO",
  SECURITY_AND_INVESTIGATIONS: "Public Sector & NGO",

  // Loose matches for non-standard values
  Healthcare: "Healthcare & Life Sciences",
  Industrials: "Manufacturing & Industrial",
  Transportation: "Transportation & Logistics",
  Agriculture: "Food & Agriculture",
  Education: "Education & Training",
  Energy: "Energy & Utilities",
  Manufacturing: "Manufacturing & Industrial",
  Communications: "Telecom & Media",
  Finance: "Financial Services",
  Telecommunications: "Telecom & Media",
  "Consumer discretionary": "Retail & Consumer",
  "Consumer staples": "Retail & Consumer",
  Hospitality: "Hospitality & Tourism",
  Engineering: "Manufacturing & Industrial",
  Technology: "Technology & Software",
  Distribution: "Transportation & Logistics",
  "Software developer": "Technology & Software",
  "Business Services": "Professional Services",
  Furniture: "Retail & Consumer",
  Research: "Education & Training",
};

export function standardIndustry(raw: string): string {
  if (!raw || raw === "Other" || raw === "masked data") return "Other";
  // HubSpot sends space-separated ("AIRLINES AVIATION"); keys use underscores
  const withUnderscores = raw.trim().replace(/\s+/g, "_").toUpperCase();
  return INDUSTRY_MAP[raw] ?? INDUSTRY_MAP[withUnderscores] ?? "Other";
}

export function normProvenance(raw: string): string {
  if (!raw) return "";
  if (raw === "Partner" || raw === "Partners") return "Partners";
  return raw;
}

export function groupPipeline(raw: string): string {
  if (!raw || raw === "masked data") return "—";
  const dash = raw.indexOf(" - ");
  const base = dash > 0 ? raw.substring(0, dash).trim() : raw.trim();
  const upper = base.toUpperCase();
  if (upper === "SALES" || upper.startsWith("SALE")) return "Sales";
  if (upper === "CX" || upper.startsWith("CX")) return "CX";
  if (upper.startsWith("PARTNER")) return "Partners";
  if (upper === "OPERATIONS") return "Operations";
  if (upper.startsWith("PRE")) return "Pre Sales";
  return base;
}

export const STANDARD_INDUSTRIES = [
  "Technology & Software",
  "Telecom & Media",
  "Healthcare & Life Sciences",
  "Financial Services",
  "Retail & Consumer",
  "Hospitality & Tourism",
  "Construction & Real Estate",
  "Manufacturing & Industrial",
  "Education & Training",
  "Professional Services",
  "Transportation & Logistics",
  "Energy & Utilities",
  "Food & Agriculture",
  "Public Sector & NGO",
  "Other",
];
