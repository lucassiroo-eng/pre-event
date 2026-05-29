// Maps a French city name to a region code (matches RegionCode in mockData.ts).
// Comprehensive enough for the largest ~200 communes; falls back to "unknown".

type RegionCode =
  | "11" | "24" | "27" | "28" | "32" | "44" | "52"
  | "53" | "75" | "76" | "84" | "93" | "94";

// Normalize: lowercase, strip accents, remove arrondissement suffix, trim.
export function normalizeCity(raw: string | null | undefined): string {
  if (!raw) return "";
  return raw
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+\d+(er|e|eme)?$/i, "") // "paris 15", "lyon 3e"
    .replace(/^(le|la|les|l')\s+/, "")
    .replace(/[-']/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const CITY_REGION: Record<string, RegionCode> = {};

function add(region: RegionCode, cities: string[]) {
  for (const c of cities) CITY_REGION[normalizeCity(c)] = region;
}

// 11 — Île-de-France
add("11", [
  "Paris", "Boulogne-Billancourt", "Saint-Denis", "Argenteuil", "Montreuil",
  "Nanterre", "Courbevoie", "Versailles", "Vitry-sur-Seine", "Créteil",
  "Asnières-sur-Seine", "Aubervilliers", "Colombes", "Aulnay-sous-Bois",
  "Rueil-Malmaison", "Champigny-sur-Marne", "Saint-Maur-des-Fossés",
  "Drancy", "Issy-les-Moulineaux", "Levallois-Perret", "Neuilly-sur-Seine",
  "Antony", "Noisy-le-Grand", "Cergy", "Sarcelles", "Évry", "Évry-Courcouronnes",
  "Pantin", "Maisons-Alfort", "Meaux", "Chelles", "Clichy", "Ivry-sur-Seine",
  "Villejuif", "Suresnes", "Bobigny", "Bondy", "Fontenay-sous-Bois",
  "Clamart", "Sevran", "Saint-Ouen", "Massy", "Puteaux", "Villeneuve-Saint-Georges",
  "Le Chesnay", "Vincennes", "Romainville", "Saint-Germain-en-Laye",
  "Bagneux", "Charenton-le-Pont", "Gennevilliers", "Vélizy-Villacoublay",
  "Saint-Quentin-en-Yvelines", "Roissy-en-France", "Roissy", "La Défense",
  "Melun", "Pontoise", "Mantes-la-Jolie",
]);

// 24 — Centre-Val de Loire
add("24", [
  "Tours", "Orléans", "Bourges", "Blois", "Chartres", "Châteauroux",
  "Joué-lès-Tours", "Saint-Jean-de-Braye", "Olivet", "Fleury-les-Aubrais",
  "Vierzon", "Dreux", "Vendôme",
]);

// 27 — Bourgogne-Franche-Comté
add("27", [
  "Dijon", "Besançon", "Belfort", "Chalon-sur-Saône", "Nevers", "Auxerre",
  "Mâcon", "Sens", "Montbéliard", "Le Creusot", "Beaune", "Dole", "Vesoul",
]);

// 28 — Normandie
add("28", [
  "Le Havre", "Rouen", "Caen", "Cherbourg", "Cherbourg-en-Cotentin",
  "Évreux", "Dieppe", "Sotteville-lès-Rouen", "Saint-Étienne-du-Rouvray",
  "Le Grand-Quevilly", "Hérouville-Saint-Clair", "Alençon", "Lisieux",
  "Vernon", "Louviers", "Mont-Saint-Aignan",
]);

// 32 — Hauts-de-France
add("32", [
  "Lille", "Amiens", "Roubaix", "Tourcoing", "Dunkerque", "Calais", "Arras",
  "Villeneuve-d'Ascq", "Valenciennes", "Boulogne-sur-Mer", "Beauvais",
  "Compiègne", "Saint-Quentin", "Cambrai", "Douai", "Lens", "Wattrelos",
  "Marcq-en-Barœul", "Hénin-Beaumont", "Soissons", "Maubeuge", "Creil",
]);

// 44 — Grand Est
add("44", [
  "Strasbourg", "Reims", "Metz", "Nancy", "Mulhouse", "Colmar",
  "Troyes", "Charleville-Mézières", "Thionville", "Épinal", "Haguenau",
  "Schiltigheim", "Vandœuvre-lès-Nancy", "Saint-Dizier", "Châlons-en-Champagne",
  "Bar-le-Duc", "Forbach", "Sarreguemines", "Verdun", "Illkirch-Graffenstaden",
]);

// 52 — Pays de la Loire
add("52", [
  "Nantes", "Angers", "Le Mans", "Saint-Nazaire", "Cholet", "La Roche-sur-Yon",
  "Laval", "Saint-Herblain", "Rezé", "Saint-Sébastien-sur-Loire",
  "Orvault", "Vertou", "Les Sables-d'Olonne",
]);

// 53 — Bretagne
add("53", [
  "Rennes", "Brest", "Quimper", "Lorient", "Vannes", "Saint-Malo",
  "Saint-Brieuc", "Lanester", "Fougères", "Concarneau", "Lannion",
  "Plérin", "Ploemeur", "Cesson-Sévigné",
]);

// 75 — Nouvelle-Aquitaine
add("75", [
  "Bordeaux", "Limoges", "Poitiers", "Pau", "La Rochelle", "Mérignac",
  "Pessac", "Bayonne", "Anglet", "Biarritz", "Niort", "Angoulême",
  "Périgueux", "Brive-la-Gaillarde", "Agen", "Talence", "Saintes",
  "Cognac", "Mont-de-Marsan", "Rochefort", "Libourne",
]);

// 76 — Occitanie
add("76", [
  "Toulouse", "Montpellier", "Nîmes", "Perpignan", "Béziers", "Narbonne",
  "Albi", "Carcassonne", "Tarbes", "Sète", "Castres", "Alès", "Rodez",
  "Colomiers", "Tournefeuille", "Blagnac", "Montauban", "Cahors", "Auch",
  "Mende", "Lourdes",
]);

// 84 — Auvergne-Rhône-Alpes
add("84", [
  "Lyon", "Grenoble", "Saint-Étienne", "Villeurbanne", "Clermont-Ferrand",
  "Annecy", "Valence", "Chambéry", "Vénissieux", "Caluire-et-Cuire",
  "Bourg-en-Bresse", "Roanne", "Vichy", "Aurillac", "Le Puy-en-Velay",
  "Aubière", "Bron", "Bourgoin-Jallieu", "Romans-sur-Isère", "Annemasse",
  "Albertville", "Saint-Priest", "Vaulx-en-Velin", "Échirolles",
  "Meyzieu", "Rillieux-la-Pape", "Oullins", "Sainte-Foy-lès-Lyon",
  "Décines-Charpieu", "Ecully", "Écully", "Villefranche-sur-Saône",
  "Voiron", "Thonon-les-Bains", "Aix-les-Bains",
]);

// 93 — Provence-Alpes-Côte d'Azur
add("93", [
  "Marseille", "Nice", "Toulon", "Aix-en-Provence", "Avignon", "Antibes",
  "Cannes", "La Seyne-sur-Mer", "Hyères", "Fréjus", "Grasse", "Arles",
  "Gap", "Martigues", "Cagnes-sur-Mer", "Saint-Raphaël", "Istres",
  "Vitrolles", "Salon-de-Provence", "Aubagne", "Marignane", "Le Cannet",
  "Draguignan", "Menton", "Sophia Antipolis", "Sophia-Antipolis",
]);

// 94 — Corse
add("94", [
  "Ajaccio", "Bastia", "Porto-Vecchio", "Corte", "Calvi", "Sartène",
]);

export function regionFromCity(city: string | null | undefined): RegionCode | "unknown" {
  const key = normalizeCity(city);
  if (!key) return "unknown";
  return CITY_REGION[key] ?? "unknown";
}
