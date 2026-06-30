/**
 * 12 macro-sectors used across Strategy and Playbook tabs.
 * Single source of truth for industry classification.
 *
 * Three entry points:
 *   hubspotToSector(raw)   — normalize a HubSpot industry string
 *   cnaeToSector(code)     — map a 4-digit CNAE-2009 code (string or number)
 *   SECTORS                — ordered list for display/sorting
 */

export const SECTORS = [
  "Tecnología & Software",
  "Industria & Manufactura",
  "Construcción & Inmobiliaria",
  "Agroalimentario",
  "Hostelería & Turismo",
  "Salud",
  "Distribución & Retail",
  "Transporte & Logística",
  "Servicios Profesionales",
  "Educación & Formación",
  "Energía & Medioambiente",
  "Otros Servicios",
] as const;

export type Sector = typeof SECTORS[number];

// ── HubSpot → sector ──────────────────────────────────────────────────────────
// Keys: HubSpot UPPER_SNAKE_CASE internal identifiers + common free-text variants

const HUBSPOT_MAP: Record<string, Sector> = {
  // Tecnología & Software
  INFORMATION_TECHNOLOGY_AND_SERVICES: "Tecnología & Software",
  COMPUTER_SOFTWARE:                   "Tecnología & Software",
  COMPUTER_HARDWARE:                   "Tecnología & Software",
  COMPUTER_NETWORKING:                 "Tecnología & Software",
  COMPUTER_NETWORK_SECURITY:           "Tecnología & Software",
  COMPUTER_GAMES:                      "Tecnología & Software",
  INTERNET:                            "Tecnología & Software",
  ONLINE_MEDIA:                        "Tecnología & Software",
  SEMICONDUCTORS:                      "Tecnología & Software",
  NANOTECHNOLOGY:                      "Tecnología & Software",
  WIRELESS:                            "Tecnología & Software",
  TELECOMMUNICATIONS:                  "Tecnología & Software",
  BROADCAST_MEDIA:                     "Tecnología & Software",
  MEDIA_PRODUCTION:                    "Tecnología & Software",
  NEWSPAPERS:                          "Tecnología & Software",
  PUBLISHING:                          "Tecnología & Software",
  ANIMATION:                           "Tecnología & Software",
  MOTION_PICTURES_AND_FILM:            "Tecnología & Software",
  MUSIC:                               "Tecnología & Software",
  PERFORMING_ARTS:                     "Hostelería & Turismo",
  FINE_ART:                            "Hostelería & Turismo",
  ARTS_AND_CRAFTS:                     "Hostelería & Turismo",
  PHOTOGRAPHY:                         "Servicios Profesionales",
  GRAPHIC_DESIGN:                      "Servicios Profesionales",
  DESIGN:                              "Servicios Profesionales",
  WRITING_AND_EDITING:                 "Servicios Profesionales",

  // Industria & Manufactura
  INDUSTRIAL_AUTOMATION:               "Industria & Manufactura",
  MECHANICAL_OR_INDUSTRIAL_ENGINEERING:"Industria & Manufactura",
  MACHINERY:                           "Industria & Manufactura",
  ELECTRICAL_ELECTRONIC_MANUFACTURING: "Industria & Manufactura",
  AUTOMOTIVE:                          "Industria & Manufactura",
  AVIATION_AEROSPACE:                  "Industria & Manufactura",
  DEFENSE_SPACE:                       "Industria & Manufactura",
  PLASTICS:                            "Industria & Manufactura",
  TEXTILES:                            "Industria & Manufactura",
  PRINTING:                            "Industria & Manufactura",
  PACKAGING_AND_CONTAINERS:            "Industria & Manufactura",
  PAPER_FOREST_PRODUCTS:               "Industria & Manufactura",
  CHEMICALS:                           "Industria & Manufactura",
  RAILROAD_MANUFACTURE:                "Industria & Manufactura",
  SHIPBUILDING:                        "Industria & Manufactura",
  TOBACCO:                             "Industria & Manufactura",
  CONSUMER_ELECTRONICS:                "Industria & Manufactura",

  // Construcción & Inmobiliaria
  CONSTRUCTION:                        "Construcción & Inmobiliaria",
  REAL_ESTATE:                         "Construcción & Inmobiliaria",
  COMMERCIAL_REAL_ESTATE:              "Construcción & Inmobiliaria",
  BUILDING_MATERIALS:                  "Construcción & Inmobiliaria",
  ARCHITECTURE_PLANNING:               "Construcción & Inmobiliaria",
  CIVIL_ENGINEERING:                   "Construcción & Inmobiliaria",
  FACILITIES_SERVICES:                 "Construcción & Inmobiliaria",
  GLASS_CERAMICS_CONCRETE:             "Construcción & Inmobiliaria",

  // Agroalimentario
  FOOD_BEVERAGES:                      "Agroalimentario",
  FOOD_PRODUCTION:                     "Agroalimentario",
  FARMING:                             "Agroalimentario",
  DAIRY:                               "Agroalimentario",
  FISHERY:                             "Agroalimentario",
  RANCHING:                            "Agroalimentario",
  WINE_AND_SPIRITS:                    "Agroalimentario",

  // Hostelería & Turismo
  HOSPITALITY:                         "Hostelería & Turismo",
  RESTAURANTS:                         "Hostelería & Turismo",
  LEISURE_TRAVEL_TOURISM:              "Hostelería & Turismo",
  RECREATIONAL_FACILITIES_AND_SERVICES:"Hostelería & Turismo",
  SPORTS:                              "Hostelería & Turismo",
  EVENTS_SERVICES:                     "Hostelería & Turismo",
  AIRLINES_AVIATION:                   "Hostelería & Turismo",
  ENTERTAINMENT:                       "Hostelería & Turismo",
  GAMBLING_CASINOS:                    "Hostelería & Turismo",

  // Salud
  HOSPITAL_HEALTH_CARE:                "Salud",
  HEALTH_WELLNESS_AND_FITNESS:         "Salud",
  MEDICAL_DEVICES:                     "Salud",
  MEDICAL_PRACTICE:                    "Salud",
  MENTAL_HEALTH_CARE:                  "Salud",
  PHARMACEUTICALS:                     "Salud",
  BIOTECHNOLOGY:                       "Salud",
  VETERINARY:                          "Salud",
  ALTERNATIVE_MEDICINE:                "Salud",

  // Distribución & Retail
  RETAIL:                              "Distribución & Retail",
  CONSUMER_SERVICES:                   "Distribución & Retail",
  CONSUMER_GOODS:                      "Distribución & Retail",
  APPAREL_FASHION:                     "Distribución & Retail",
  LUXURY_GOODS_JEWELRY:                "Distribución & Retail",
  COSMETICS:                           "Distribución & Retail",
  SPORTING_GOODS:                      "Distribución & Retail",
  FURNITURE:                           "Distribución & Retail",
  SUPERMARKETS:                        "Distribución & Retail",
  WHOLESALE:                           "Distribución & Retail",

  // Transporte & Logística
  TRANSPORTATION_TRUCKING_RAILROAD:    "Transporte & Logística",
  LOGISTICS_AND_SUPPLY_CHAIN:          "Transporte & Logística",
  MARITIME:                            "Transporte & Logística",
  PACKAGE_FREIGHT_DELIVERY:            "Transporte & Logística",
  WAREHOUSING:                         "Transporte & Logística",
  IMPORT_AND_EXPORT:                   "Transporte & Logística",

  // Servicios Profesionales
  MANAGEMENT_CONSULTING:               "Servicios Profesionales",
  LEGAL_SERVICES:                      "Servicios Profesionales",
  LAW_PRACTICE:                        "Servicios Profesionales",
  HUMAN_RESOURCES:                     "Servicios Profesionales",
  STAFFING_AND_RECRUITING:             "Servicios Profesionales",
  MARKETING_AND_ADVERTISING:           "Servicios Profesionales",
  PUBLIC_RELATIONS_AND_COMMUNICATIONS: "Servicios Profesionales",
  MARKET_RESEARCH:                     "Servicios Profesionales",
  TRANSLATION_AND_LOCALIZATION:        "Servicios Profesionales",
  OUTSOURCING_OFFSHORING:              "Servicios Profesionales",
  BUSINESS_SUPPLIES_AND_EQUIPMENT:     "Servicios Profesionales",
  INFORMATION_SERVICES:                "Servicios Profesionales",
  ACCOUNTING:                          "Servicios Profesionales",
  SECURITY_AND_INVESTIGATIONS:         "Servicios Profesionales",

  // Educación & Formación
  HIGHER_EDUCATION:                    "Educación & Formación",
  EDUCATION_MANAGEMENT:                "Educación & Formación",
  PRIMARY_SECONDARY_EDUCATION:         "Educación & Formación",
  PROFESSIONAL_TRAINING_COACHING:      "Educación & Formación",
  LIBRARIES:                           "Educación & Formación",
  MUSEUMS_AND_INSTITUTIONS:            "Educación & Formación",
  RESEARCH:                            "Educación & Formación",
  E_LEARNING:                          "Educación & Formación",

  // Energía & Medioambiente
  OIL_ENERGY:                          "Energía & Medioambiente",
  RENEWABLES_ENVIRONMENT:              "Energía & Medioambiente",
  UTILITIES:                           "Energía & Medioambiente",
  MINING_METALS:                       "Energía & Medioambiente",
  ENVIRONMENTAL_SERVICES:              "Energía & Medioambiente",

  // Otros Servicios
  FINANCIAL_SERVICES:                  "Otros Servicios",
  BANKING:                             "Otros Servicios",
  INSURANCE:                           "Otros Servicios",
  INVESTMENT_MANAGEMENT:               "Otros Servicios",
  INVESTMENT_BANKING:                  "Otros Servicios",
  CAPITAL_MARKETS:                     "Otros Servicios",
  VENTURE_CAPITAL_PRIVATE_EQUITY:      "Otros Servicios",
  GOVERNMENT_ADMINISTRATION:           "Otros Servicios",
  NON_PROFIT_ORGANIZATION_MANAGEMENT:  "Otros Servicios",
  CIVIC_SOCIAL_ORGANIZATION:           "Otros Servicios",
  RELIGIOUS_INSTITUTIONS:              "Otros Servicios",
  POLITICAL_ORGANIZATION:              "Otros Servicios",
  INTERNATIONAL_AFFAIRS:               "Otros Servicios",
  PUBLIC_SAFETY:                       "Otros Servicios",
  PHILANTHROPY:                        "Otros Servicios",
  INDIVIDUAL_FAMILY_SERVICES:          "Otros Servicios",
  EXECUTIVE_OFFICE:                    "Otros Servicios",
  FUND_RAISING:                        "Otros Servicios",
  GOVERNMENT_RELATIONS:                "Otros Servicios",
  THINK_TANKS:                         "Otros Servicios",
  PUBLIC_POLICY:                       "Otros Servicios",
  INTERNATIONAL_TRADE_AND_DEVELOPMENT: "Servicios Profesionales",
  PROGRAM_DEVELOPMENT:                 "Tecnología & Software",
  MILITARY:                            "Otros Servicios",
  LAW_ENFORCEMENT:                     "Otros Servicios",
};

// Free-text / display-name variants (what HubSpot sometimes sends as readable strings)
const FREETEXT_MAP: Record<string, Sector> = {
  "IT & Services":            "Tecnología & Software",
  "Software":                 "Tecnología & Software",
  "Consumer Electronics":     "Industria & Manufactura",
  "Machinery":                "Industria & Manufactura",
  "Mechanical Engineering":   "Industria & Manufactura",
  "Industrial Automation":    "Industria & Manufactura",
  "Automotive":               "Industria & Manufactura",
  "Construction":             "Construcción & Inmobiliaria",
  "Food & Beverages":         "Agroalimentario",
  "Food Production":          "Agroalimentario",
  "Farming":                  "Agroalimentario",
  "Wine & Spirits":           "Agroalimentario",
  "Hospitality":              "Hostelería & Turismo",
  "Restaurants":              "Hostelería & Turismo",
  "Leisure & Tourism":        "Hostelería & Turismo",
  "Recreational Facilities":  "Hostelería & Turismo",
  "Entertainment":            "Hostelería & Turismo",
  "Healthcare":               "Salud",
  "Retail":                   "Distribución & Retail",
  "Apparel & Fashion":        "Distribución & Retail",
  "Consumer Goods":           "Distribución & Retail",
  "Transport":                "Transporte & Logística",
  "Logistics":                "Transporte & Logística",
  "Management Consulting":    "Servicios Profesionales",
  "Marketing & Advertising":  "Servicios Profesionales",
  "Professional Training":    "Educación & Formación",
  "Education":                "Educación & Formación",
  "Oil & Energy":             "Energía & Medioambiente",
  "Renewables":               "Energía & Medioambiente",
  "Environmental Services":   "Energía & Medioambiente",
  // Grouped / translated names from SQL industry columns
  "Industrial & Manufacturing":       "Industria & Manufactura",
  "Professional Services":            "Servicios Profesionales",
  "Technology & Telecommunications":  "Tecnología & Software",
  "Health & Pharma":                  "Salud",
  "Energy & Utilities":               "Energía & Medioambiente",
  "Public & Non-Profit Sectors":      "Otros Servicios",
  "Financial Services":               "Otros Servicios",
  "Agriculture":                      "Agroalimentario",
  "Manufacturing":                    "Industria & Manufactura",
  "Energy":                           "Energía & Medioambiente",
  "Transportation":                   "Transporte & Logística",
  "Research":                         "Educación & Formación",
  // Sector names themselves (already normalized — pass-through)
  "Tecnología & Software":    "Tecnología & Software",
  "Industria & Manufactura":  "Industria & Manufactura",
  "Construcción & Inmobiliaria": "Construcción & Inmobiliaria",
  "Agroalimentario":          "Agroalimentario",
  "Hostelería & Turismo":     "Hostelería & Turismo",
  "Salud":                    "Salud",
  "Distribución & Retail":    "Distribución & Retail",
  "Transporte & Logística":   "Transporte & Logística",
  "Servicios Profesionales":  "Servicios Profesionales",
  "Educación & Formación":    "Educación & Formación",
  "Energía & Medioambiente":  "Energía & Medioambiente",
  "Otros Servicios":          "Otros Servicios",
};

export function hubspotToSector(raw: string): Sector {
  if (!raw || raw === "Other" || raw === "masked data") return "Otros Servicios";
  // 1. Direct free-text match (HubSpot display names, already-normalized names)
  const direct = FREETEXT_MAP[raw.trim()];
  if (direct) return direct;
  // 2. UPPER_SNAKE_CASE match (HubSpot internal IDs)
  const upper = raw.trim().replace(/\s+/g, "_").toUpperCase();
  return HUBSPOT_MAP[upper] ?? "Otros Servicios";
}

// ── CNAE-2009 4-digit → sector ────────────────────────────────────────────────
// Accepts strings ("0111", "4711") or numbers (111, 4711).
// Uses 2-digit section prefixes for most ranges; specific 4-digit overrides where needed.

export function cnaeToSector(code: string | number): Sector {
  const n = typeof code === "number" ? code : parseInt(String(code).replace(/\D/g, ""), 10);
  if (isNaN(n)) return "Otros Servicios";

  const s2 = Math.floor(n / 100); // two-digit section (e.g. 4711 → 47)
  const s4 = n;                   // four-digit for specific overrides

  // Agriculture, livestock, fishing
  if (s2 >= 1 && s2 <= 3) return "Agroalimentario";

  // Mining & quarrying
  if (s2 >= 5 && s2 <= 9) return "Energía & Medioambiente";

  // Manufacturing (10-33)
  if (s2 >= 10 && s2 <= 12) return "Agroalimentario";        // food, beverages, tobacco
  if (s2 >= 13 && s2 <= 15) return "Distribución & Retail";  // textiles, apparel, leather
  if (s2 >= 16 && s2 <= 18) return "Industria & Manufactura";// wood, paper, printing
  if (s2 === 19) return "Energía & Medioambiente";            // petroleum refining
  if (s2 === 20) return "Industria & Manufactura";            // chemicals
  if (s2 === 21) return "Salud";                              // pharma
  if (s2 >= 22 && s2 <= 25) return "Industria & Manufactura";// plastics, metals
  if (s2 === 26) return "Tecnología & Software";              // electronics, computers, optics
  if (s2 >= 27 && s2 <= 30) return "Industria & Manufactura";// electrical, machinery, vehicles
  if (s2 >= 31 && s2 <= 33) return "Industria & Manufactura";// furniture, repair

  // Energy & utilities
  if (s2 === 35) return "Energía & Medioambiente";
  if (s2 >= 36 && s2 <= 39) return "Energía & Medioambiente";

  // Construction
  if (s2 >= 41 && s2 <= 43) return "Construcción & Inmobiliaria";

  // Wholesale & retail trade; motor vehicle repair
  if (s2 >= 45 && s2 <= 47) return "Distribución & Retail";

  // Transport & storage
  if (s2 >= 49 && s2 <= 53) return "Transporte & Logística";

  // Hospitality
  if (s2 === 55 || s2 === 56) return "Hostelería & Turismo";

  // Information & communications (58-63)
  if (s2 >= 58 && s2 <= 63) return "Tecnología & Software";

  // Financial & insurance
  if (s2 >= 64 && s2 <= 66) return "Otros Servicios";

  // Real estate
  if (s2 === 68) return "Construcción & Inmobiliaria";

  // Professional, scientific & technical (69-75)
  if (s2 >= 69 && s2 <= 71) return "Servicios Profesionales"; // legal, accounting, engineering
  if (s2 === 72) return "Educación & Formación";               // R&D
  if (s2 >= 73 && s2 <= 74) return "Servicios Profesionales"; // advertising, photography
  if (s2 === 75) return "Salud";                               // veterinary

  // Administrative & support services (77-82)
  if (s2 >= 77 && s2 <= 82) return "Servicios Profesionales";

  // Public administration
  if (s2 === 84) return "Otros Servicios";

  // Education
  if (s2 === 85) return "Educación & Formación";

  // Health & social work
  if (s2 >= 86 && s2 <= 88) return "Salud";

  // Arts, entertainment & recreation (90-93)
  if (s2 >= 90 && s2 <= 93) return "Hostelería & Turismo";

  // Other services (94-96)
  if (s2 >= 94 && s2 <= 96) return "Otros Servicios";

  // Households, extraterritorial (97-99)
  return "Otros Servicios";
}
