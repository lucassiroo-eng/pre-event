// City → region code mapping for all supported countries.
// Used after HubSpot enrichment (which returns city) to assign a region.

const norm = (s: string) =>
  s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase()
    .replace(/\s+\d+(er|e|eme)?$/i, "")
    .replace(/^(le|la|les|l'|el|la|los|las|il|lo|gli|le)\s+/i, "")
    .replace(/[-']/g, " ").replace(/\s+/g, " ").trim();

type CityMap = Record<string, string>;
const maps: Record<string, CityMap> = {};

function addMap(country: string, entries: [string, string[]][]) {
  if (!maps[country]) maps[country] = {};
  for (const [code, cities] of entries) {
    for (const c of cities) maps[country][norm(c)] = code;
  }
}

// ── FRANCE (code = INSEE region codes, matches france-regions.geojson.json) ──
addMap("fr", [
  ["11", ["Paris","Boulogne-Billancourt","Saint-Denis","Argenteuil","Montreuil","Nanterre","Versailles","Créteil","Courbevoie","Vitry-sur-Seine","Asnières-sur-Seine","Colombes","Aubervilliers","Aulnay-sous-Bois","Rueil-Malmaison","Champigny-sur-Marne","Saint-Maur-des-Fossés","Drancy","Issy-les-Moulineaux","Levallois-Perret","Neuilly-sur-Seine","Antony","Noisy-le-Grand","Cergy","Sarcelles","Évry","Pantin","Maisons-Alfort","Meaux","Chelles","Clichy","Ivry-sur-Seine","Villejuif","Suresnes","Bobigny","Bondy","Fontenay-sous-Bois","Clamart","Sevran","Saint-Ouen","Massy","Puteaux","Melun","Pontoise","Mantes-la-Jolie","Roissy-en-France","La Défense","Saint-Germain-en-Laye","Vincennes","Vélizy-Villacoublay"]],
  ["28", ["Le Havre","Rouen","Caen","Cherbourg","Évreux","Dieppe","Alençon","Lisieux"]],
  ["32", ["Lille","Amiens","Roubaix","Tourcoing","Dunkerque","Calais","Arras","Valenciennes","Boulogne-sur-Mer","Beauvais","Lens","Douai"]],
  ["44", ["Strasbourg","Reims","Metz","Nancy","Mulhouse","Colmar","Troyes","Thionville","Épinal","Haguenau","Verdun"]],
  ["52", ["Nantes","Angers","Le Mans","Saint-Nazaire","Cholet","La Roche-sur-Yon","Laval","Saint-Herblain"]],
  ["53", ["Rennes","Brest","Quimper","Lorient","Vannes","Saint-Malo","Saint-Brieuc","Cesson-Sévigné"]],
  ["75", ["Bordeaux","Limoges","Poitiers","Pau","La Rochelle","Mérignac","Pessac","Bayonne","Niort","Angoulême","Périgueux","Brive-la-Gaillarde","Agen","Talence"]],
  ["76", ["Toulouse","Montpellier","Nîmes","Perpignan","Béziers","Narbonne","Albi","Carcassonne","Tarbes","Sète","Castres","Montauban"]],
  ["84", ["Lyon","Grenoble","Saint-Étienne","Villeurbanne","Clermont-Ferrand","Annecy","Valence","Chambéry","Vénissieux","Bourg-en-Bresse","Roanne","Échirolles","Annemasse"]],
  ["93", ["Marseille","Nice","Toulon","Aix-en-Provence","Avignon","Antibes","Cannes","Grasse","Arles","Gap","Martigues","Aubagne","Menton","Sophia Antipolis"]],
  ["24", ["Tours","Orléans","Bourges","Blois","Chartres","Châteauroux"]],
  ["27", ["Dijon","Besançon","Belfort","Chalon-sur-Saône","Nevers","Auxerre","Mâcon","Montbéliard"]],
  ["94", ["Ajaccio","Bastia","Porto-Vecchio","Corte"]],
]);

// ── SPAIN (code = region name, matches spain-regions.geojson.json) ──
addMap("es", [
  ["Madrid", ["Madrid","Alcalá de Henares","Leganés","Getafe","Alcorcón","Fuenlabrada","Móstoles","Torrejón de Ardoz","Parla","Alcobendas","Las Rozas","Pozuelo de Alarcón","Majadahonda","Rivas-Vaciamadrid","Tres Cantos"]],
  ["Cataluña", ["Barcelona","Hospitalet de Llobregat","Badalona","Terrassa","Sabadell","Mataró","Santa Coloma de Gramenet","Tarragona","Girona","Lleida","Reus","Igualada","Vilanova i la Geltrú","Cornellà de Llobregat","Manresa"]],
  ["Andalucia", ["Sevilla","Málaga","Córdoba","Granada","Almería","Cádiz","Jerez de la Frontera","Huelva","Dos Hermanas","Algeciras","Marbella","Linares","Jaén","Motril","Torremolinos","Roquetas de Mar"]],
  ["Valencia", ["Valencia","Alicante","Elche","Castellón de la Plana","Torrent","Benidorm","Orihuela","Gandía","Elda","Alcoy","Paterna","Sagunto"]],
  ["Pais Vasco", ["Bilbao","San Sebastián","Vitoria-Gasteiz","Barakaldo","Getxo","Irún","Donostia"]],
  ["Galicia", ["Vigo","A Coruña","Ourense","Pontevedra","Lugo","Santiago de Compostela","Ferrol"]],
  ["Castilla-Leon", ["Valladolid","Burgos","Salamanca","León","Zamora","Palencia","Segovia","Ávila","Soria"]],
  ["Castilla-La Mancha", ["Toledo","Albacete","Ciudad Real","Cuenca","Guadalajara","Talavera de la Reina"]],
  ["Aragon", ["Zaragoza","Huesca","Teruel","Calatayud"]],
  ["Murcia", ["Murcia","Cartagena","Lorca","Molina de Segura"]],
  ["Extremadura", ["Badajoz","Cáceres","Mérida","Plasencia"]],
  ["Asturias", ["Gijón","Oviedo","Avilés","Mieres"]],
  ["Navarra", ["Pamplona","Tudela","Barañáin"]],
  ["Cantabria", ["Santander","Torrelavega","Castro-Urdiales"]],
  ["La Rioja", ["Logroño","Calahorra","Arnedo"]],
  ["Baleares", ["Palma","Ibiza","Manacor","Mahón","Calvià"]],
  ["Canarias", ["Las Palmas de Gran Canaria","Santa Cruz de Tenerife","La Laguna","Arrecife","Puerto del Rosario","Arona"]],
]);

// ── ITALY (code = numeric string 1-20, matches italy-regions.geojson.json) ──
addMap("it", [
  ["1", ["Torino","Novara","Asti","Alessandria","Cuneo","Verbania","Biella","Vercelli"]],
  ["3", ["Milano","Brescia","Bergamo","Monza","Como","Varese","Pavia","Cremona","Mantova","Lecco","Sondrio","Lodi"]],
  ["5", ["Venezia","Verona","Padova","Vicenza","Treviso","Rovigo","Belluno"]],
  ["7", ["Genova","La Spezia","Savona","Imperia","Sanremo"]],
  ["8", ["Bologna","Modena","Parma","Reggio nell'Emilia","Ferrara","Rimini","Ravenna","Forlì","Piacenza"]],
  ["9", ["Firenze","Prato","Livorno","Pistoia","Pisa","Siena","Arezzo","Grosseto","Lucca","Massa"]],
  ["12", ["Roma","Latina","Frosinone","Viterbo","Rieti"]],
  ["15", ["Napoli","Salerno","Torre del Greco","Caserta","Giugliano in Campania","Pozzuoli","Benevento","Avellino"]],
  ["16", ["Bari","Taranto","Foggia","Lecce","Andria","Brindisi","Trani"]],
  ["18", ["Reggio di Calabria","Catanzaro","Cosenza","Crotone","Vibo Valentia"]],
  ["19", ["Palermo","Catania","Messina","Siracusa","Ragusa","Trapani","Agrigento","Caltanissetta","Enna"]],
  ["20", ["Cagliari","Sassari","Olbia","Nuoro","Oristano"]],
  ["4", ["Trento","Bolzano","Rovereto"]],
  ["6", ["Trieste","Udine","Pordenone","Gorizia"]],
  ["10", ["Perugia","Terni"]],
  ["11", ["Ancona","Pesaro","Macerata","Ascoli Piceno","Fermo"]],
  ["13", ["L'Aquila","Pescara","Chieti","Teramo"]],
  ["17", ["Potenza","Matera"]],
]);

// ── GERMANY (code = DE-XX, matches germany-regions.geojson.json) ──
addMap("de", [
  ["DE-BY", ["München","Nürnberg","Augsburg","Regensburg","Ingolstadt","Würzburg","Fürth","Erlangen","Bamberg","Landshut"]],
  ["DE-NW", ["Köln","Düsseldorf","Dortmund","Essen","Duisburg","Bochum","Wuppertal","Bielefeld","Bonn","Münster","Gelsenkirchen","Mönchengladbach","Aachen","Krefeld","Oberhausen","Hagen","Hamm","Solingen"]],
  ["DE-BW", ["Stuttgart","Karlsruhe","Mannheim","Freiburg im Breisgau","Heidelberg","Heilbronn","Ulm","Pforzheim","Reutlingen","Konstanz"]],
  ["DE-HE", ["Frankfurt am Main","Wiesbaden","Kassel","Darmstadt","Offenbach am Main","Hanau","Gießen","Marburg","Fulda"]],
  ["DE-BE", ["Berlin"]]  ,
  ["DE-HH", ["Hamburg"]],
  ["DE-NI", ["Hannover","Braunschweig","Osnabrück","Oldenburg","Göttingen","Wolfsburg","Hildesheim","Salzgitter"]],
  ["DE-SN", ["Dresden","Leipzig","Chemnitz","Zwickau","Erfurt","Plauen"]],
  ["DE-RP", ["Mainz","Ludwigshafen","Koblenz","Trier","Kaiserslautern"]],
  ["DE-ST", ["Magdeburg","Halle","Dessau-Roßlau"]],
  ["DE-BB", ["Potsdam","Cottbus","Brandenburg an der Havel"]],
  ["DE-TH", ["Erfurt","Jena","Gera","Weimar"]],
  ["DE-MV", ["Rostock","Schwerin","Greifswald","Stralsund"]],
  ["DE-SH", ["Kiel","Lübeck","Flensburg"]],
  ["DE-SL", ["Saarbrücken","Saarlouis","Neunkirchen"]],
  ["DE-HB", ["Bremen","Bremerhaven"]],
]);

// ── BRAZIL (code = UF sigla, matches brazil-regions.geojson.json) ──
addMap("br", [
  ["SP", ["São Paulo","Guarulhos","Campinas","São Bernardo do Campo","Santo André","Osasco","Ribeirão Preto","Sorocaba","Mauá","São José dos Campos","Santos","Jundiaí","Piracicaba","Carapicuíba","Bauru"]],
  ["RJ", ["Rio de Janeiro","São Gonçalo","Duque de Caxias","Nova Iguaçu","Niterói","Belford Roxo","Campos dos Goytacazes","São João de Meriti","Petrópolis","Volta Redonda"]],
  ["MG", ["Belo Horizonte","Uberlândia","Contagem","Juiz de Fora","Betim","Montes Claros","Ribeirão das Neves","Uberaba","Governador Valadares"]],
  ["RS", ["Porto Alegre","Caxias do Sul","Canoas","Pelotas","Santa Maria","Gravataí","Novo Hamburgo","São Leopoldo"]],
  ["PR", ["Curitiba","Londrina","Maringá","Ponta Grossa","Cascavel","São José dos Pinhais","Colombo"]],
  ["BA", ["Salvador","Feira de Santana","Vitória da Conquista","Camaçari","Juazeiro","Lauro de Freitas","Ilhéus"]],
  ["PE", ["Recife","Caruaru","Petrolina","Olinda","Paulista","Jaboatão dos Guararapes","Caruaru"]],
  ["CE", ["Fortaleza","Caucaia","Juazeiro do Norte","Maracanaú","Sobral","Crato"]],
  ["PA", ["Belém","Ananindeua","Santarém","Marabá","Castanhal","Parauapebas"]],
  ["AM", ["Manaus","Parintins","Itacoatiara","Manacapuru"]],
  ["GO", ["Goiânia","Aparecida de Goiânia","Anápolis","Rio Verde","Luziânia"]],
  ["MA", ["São Luís","Imperatriz","São José de Ribamar","Caxias","Codó"]],
  ["ES", ["Vitória","Serra","Vila Velha","Cariacica","Cachoeiro de Itapemirim"]],
  ["MT", ["Cuiabá","Várzea Grande","Rondonópolis","Sinop"]],
  ["MS", ["Campo Grande","Dourados","Três Lagoas","Corumbá"]],
  ["AL", ["Maceió","Arapiraca","Palmeira dos Índios"]],
  ["RN", ["Natal","Mossoró","Parnamirim","Caicó"]],
  ["PB", ["João Pessoa","Campina Grande","Santa Rita"]],
  ["PI", ["Teresina","Parnaíba","Picos"]],
  ["SE", ["Aracaju","Lagarto","Itabaiana"]],
  ["SC", ["Florianópolis","Joinville","Blumenau","São José","Chapecó","Criciúma"]],
  ["RO", ["Porto Velho","Ji-Paraná","Ariquemes"]],
  ["TO", ["Palmas","Araguaína","Gurupi"]],
  ["AC", ["Rio Branco","Cruzeiro do Sul"]],
  ["AP", ["Macapá","Santana"]],
  ["RR", ["Boa Vista","Rorainópolis"]],
  ["DF", ["Brasília","Taguatinga","Ceilândia","Samambaia"]],
]);

// ── PORTUGAL (code = distrito code, matches portugal-regions.geojson.json) ──
addMap("pt", [
  ["11", ["Lisboa","Amadora","Odivelas","Loures","Sintra","Cascais","Oeiras","Almada","Setúbal","Seixal","Barreiro","Montijo"]],
  ["13", ["Porto","Vila Nova de Gaia","Matosinhos","Gondomar","Maia","Valongo","Braga","Guimarães","Barcelos","Vila do Conde","Póvoa de Varzim"]],
  ["03", ["Braga","Guimarães","Barcelos","Famalicão","Vila Nova de Famalicão"]],
  ["06", ["Coimbra","Figueira da Foz","Leiria","Aveiro","Viseu"]],
  ["08", ["Faro","Portimão","Albufeira","Loulé","Olhão","Lagos","Tavira"]],
  ["07", ["Évora","Beja","Portalegre"]],
  ["02", ["Beja","Moura","Serpa"]],
  ["18", ["Viseu","Lamego","Tondela"]],
  ["01", ["Aveiro","Oliveira de Azeméis","Santa Maria da Feira","Espinho","Ovar"]],
  ["16", ["Viana do Castelo","Caminha","Arcos de Valdevez"]],
  ["17", ["Vila Real","Chaves","Peso da Régua"]],
  ["04", ["Bragança","Mirandela","Macedo de Cavaleiros"]],
  ["09", ["Guarda","Covilhã","Fundão"]],
  ["05", ["Castelo Branco","Covilhã","Fundão"]],
  ["10", ["Leiria","Caldas da Rainha","Marinha Grande","Peniche"]],
  ["14", ["Santarém","Torres Novas","Tomar","Abrantes"]],
  ["12", ["Portalegre","Elvas","Ponte de Sor"]],
  ["15", ["Setúbal","Palmela","Sesimbra"]],
  ["20", ["Ponta Delgada","Angra do Heroísmo","Horta"]],
  ["30", ["Funchal","Câmara de Lobos","Santa Cruz"]],
]);

// ── MEXICO (code = MX-XXX, matches mexico-regions.geojson.json) ──
addMap("mx", [
  ["MX-CMX", ["Ciudad de México","México City","CDMX","Iztapalapa","Gustavo A. Madero","Álvaro Obregón","Coyoacán","Tlalpan","Xochimilco","Azcapotzalco"]],
  ["MX-JAL", ["Guadalajara","Zapopan","Tlaquepaque","Tonalá","Tlajomulco","Puerto Vallarta","Lagos de Moreno"]],
  ["MX-NLE", ["Monterrey","Apodaca","San Nicolás de los Garza","Guadalupe","General Escobedo","San Pedro Garza García","Juárez","Santa Catarina"]],
  ["MX-MEX", ["Ecatepec","Nezahualcóyotl","Naucalpan","Tlalnepantla","Chimalhuacán","Ixtapaluca","Toluca","Atizapán de Zaragoza","Cuautitlán Izcalli"]],
  ["MX-PUE", ["Puebla","Tehuacán","San Martín Texmelucan","Cholula"]],
  ["MX-GUA", ["León","Irapuato","Celaya","Salamanca","Guanajuato"]],
  ["MX-VER", ["Veracruz","Xalapa","Coatzacoalcos","Córdoba","Orizaba","Poza Rica","Tuxpan"]],
  ["MX-CHH", ["Ciudad Juárez","Chihuahua","Delicias","Cuauhtémoc"]],
  ["MX-SON", ["Hermosillo","Ciudad Obregón","Nogales","San Luis Río Colorado","Guaymas"]],
  ["MX-BCN", ["Tijuana","Mexicali","Ensenada","Tecate","Rosarito"]],
  ["MX-TAM", ["Reynosa","Matamoros","Nuevo Laredo","Tampico","Ciudad Victoria"]],
  ["MX-COA", ["Saltillo","Torreón","Monclova","Piedras Negras"]],
  ["MX-SIN", ["Culiacán","Mazatlán","Los Mochis","Guasave","Navolato"]],
  ["MX-OAX", ["Oaxaca","Salina Cruz","Juchitán de Zaragoza"]],
  ["MX-MIC", ["Morelia","Uruapan","Zamora","Apatzingán","Lázaro Cárdenas"]],
  ["MX-GRO", ["Acapulco","Chilpancingo","Iguala","Zihuatanejo"]],
  ["MX-HID", ["Pachuca","Tulancingo","Tula de Allende"]],
  ["MX-MOR", ["Cuernavaca","Jiutepec","Cuautla","Temixco"]],
  ["MX-QUE", ["Querétaro","San Juan del Río","Corregidora","El Marqués"]],
  ["MX-AGU", ["Aguascalientes","Calvillo","San Francisco de los Romo"]],
  ["MX-SLP", ["San Luis Potosí","Ciudad Valles","Matehuala","Tamazunchale"]],
  ["MX-DUR", ["Durango","Gómez Palacio","Lerdo","Guadalupe Victoria"]],
  ["MX-ZAC", ["Zacatecas","Fresnillo","Guadalupe","Calera"]],
  ["MX-YUC", ["Mérida","Valladolid","Tizimín","Progreso"]],
  ["MX-ROO", ["Cancún","Playa del Carmen","Chetumal","Cozumel","Tulum"]],
  ["MX-CHH", ["Chihuahua","Ciudad Juárez"]],
  ["MX-CAM", ["Campeche","Ciudad del Carmen","Champotón"]],
  ["MX-TAB", ["Villahermosa","Cárdenas","Comalcalco"]],
  ["MX-NAY", ["Tepic","Bahía de Banderas","Santiago Ixcuintla"]],
  ["MX-COL", ["Colima","Manzanillo","Tecomán"]],
  ["MX-BCS", ["La Paz","Los Cabos","Loreto"]],
  ["MX-TLA", ["Tlaxcala","Apizaco","Huamantla"]],
]);

export function cityToRegion(country: string, city: string | null | undefined): string {
  if (!city) return "unknown";
  const map = maps[country.toLowerCase()];
  if (!map) return "unknown";
  const key = norm(city);
  if (!key) return "unknown";
  return map[key] ?? "unknown";
}
