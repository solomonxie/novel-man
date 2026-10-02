/**
 * Places this app can place without asking anybody.
 *
 * A place in a bible or a history already has an answer, and until now the
 * only way to get it was a paid pass over the whole cast — which is a strange
 * price to pay for knowing that Egypt is Egypt. So the names that can be
 * settled from a table are settled from a table, and the model is left for the
 * ones that actually need it: a tell nobody has dug, a village named once.
 *
 * What is in here, and why it is not more:
 *
 * - Every sovereign country, which is the floor. `Egypt`, `Greece`, `Japan`.
 * - The ancient names, which is the part that earns its bytes. A reader of
 *   scripture or of Herodotus meets `Shushan` and `Caesarea Philippi` and
 *   `Ur of the Chaldees`, and no map search resolves any of them. These are
 *   the mappings a study bible's own gazetteer carries.
 * - Nothing else. There is no list of world cities here: a full one is
 *   megabytes, and it is unnecessary — a map search takes `Nagasaki` or
 *   `Shropshire` perfectly well on its own. What the table decides is not
 *   *where* a name is but whether it is a place at all, and a name that is
 *   not in it can still be looked up by hand.
 */

export type Found = {
  /** The name to put to a map. Itself, for a place that still goes by it. */
  modern: string;
  how: 'country' | 'ancient';
  /**
   * `probable` for the ancient identifications that scholars disagree about,
   * and they are marked individually below rather than all alike — Memphis is
   * not in doubt and the garden of Eden is not a map reference.
   */
  certainty: 'certain' | 'probable';
};

/**
 * Ancient and biblical names, to what a map will find. Where the identification
 * is disputed the entry says so, and a disputed pin is drawn as disputed rather
 * than quietly dropped — a reader who can see the claim can correct it.
 */
const ANCIENT: Record<string, [modern: string, certainty?: 'probable']> = {
  // Mesopotamia and Persia
  babylon: ['Hillah, Iraq'],
  nineveh: ['Mosul, Iraq'],
  ur: ['Tell el-Muqayyar, Iraq', 'probable'],
  'ur of the chaldees': ['Tell el-Muqayyar, Iraq', 'probable'],
  shushan: ['Susa, Iran'],
  susa: ['Susa, Iran'],
  ecbatana: ['Hamadan, Iran'],
  persepolis: ['Persepolis, Iran'],
  ctesiphon: ['Al-Mada’in, Iraq'],
  erech: ['Uruk, Iraq'],
  uruk: ['Uruk, Iraq'],
  accad: ['Akkad, Iraq', 'probable'],
  calneh: ['Nippur, Iraq', 'probable'],
  haran: ['Harran, Turkey'],
  carchemish: ['Karkamış, Turkey'],
  mari: ['Tell Hariri, Syria'],
  assyria: ['Northern Iraq'],
  chaldea: ['Southern Iraq'],
  elam: ['Khuzestan, Iran'],
  mesopotamia: ['Iraq'],
  padanaram: ['Harran, Turkey', 'probable'],
  'padan-aram': ['Harran, Turkey', 'probable'],

  // The Levant
  jerusalem: ['Jerusalem'],
  zion: ['Jerusalem'],
  bethlehem: ['Bethlehem, West Bank'],
  hebron: ['Hebron, West Bank'],
  jericho: ['Jericho, West Bank'],
  nazareth: ['Nazareth, Israel'],
  capernaum: ['Capernaum, Israel'],
  bethsaida: ['et-Tell, Israel', 'probable'],
  'caesarea philippi': ['Banias, Golan Heights'],
  caesarea: ['Caesarea, Israel'],
  samaria: ['Sebastia, West Bank'],
  shechem: ['Tell Balata, West Bank'],
  shiloh: ['Khirbet Seilun, West Bank'],
  bethel: ['Beitin, West Bank', 'probable'],
  gilgal: ['Jordan Valley, West Bank', 'probable'],
  hazor: ['Tel Hazor, Israel'],
  megiddo: ['Tel Megiddo, Israel'],
  armageddon: ['Tel Megiddo, Israel'],
  lachish: ['Tel Lachish, Israel'],
  beersheba: ['Beersheba, Israel'],
  gath: ['Tell es-Safi, Israel', 'probable'],
  ashkelon: ['Ashkelon, Israel'],
  ashdod: ['Ashdod, Israel'],
  gaza: ['Gaza'],
  ekron: ['Tel Miqne, Israel', 'probable'],
  joppa: ['Jaffa, Tel Aviv, Israel'],
  tyre: ['Tyre, Lebanon'],
  sidon: ['Sidon, Lebanon'],
  byblos: ['Byblos, Lebanon'],
  'gebal': ['Byblos, Lebanon'],
  damascus: ['Damascus, Syria'],
  antioch: ['Antakya, Turkey'],
  palmyra: ['Palmyra, Syria'],
  tadmor: ['Palmyra, Syria'],
  ugarit: ['Ras Shamra, Syria'],
  phoenicia: ['Coastal Lebanon'],
  canaan: ['Israel and Palestine'],
  judea: ['Southern Israel and West Bank'],
  galilee: ['Galilee, Israel'],
  gilead: ['Northwest Jordan'],
  moab: ['Central Jordan'],
  edom: ['Southern Jordan'],
  ammon: ['Amman, Jordan'],
  bashan: ['Golan Heights'],
  petra: ['Petra, Jordan'],
  sela: ['Petra, Jordan', 'probable'],
  'mount sinai': ['Mount Sinai, Egypt', 'probable'],
  horeb: ['Mount Sinai, Egypt', 'probable'],
  'mount nebo': ['Mount Nebo, Jordan'],
  'mount carmel': ['Mount Carmel, Israel'],
  'mount tabor': ['Mount Tabor, Israel'],
  'sea of galilee': ['Sea of Galilee, Israel'],
  gennesaret: ['Sea of Galilee, Israel'],
  'salt sea': ['Dead Sea'],
  jordan: ['Jordan River'],

  // Egypt and Africa
  memphis: ['Mit Rahina, Egypt'],
  thebes: ['Luxor, Egypt'],
  'no-amon': ['Luxor, Egypt'],
  heliopolis: ['Ain Shams, Cairo, Egypt'],
  on: ['Ain Shams, Cairo, Egypt', 'probable'],
  alexandria: ['Alexandria, Egypt'],
  goshen: ['Eastern Nile Delta, Egypt', 'probable'],
  zoan: ['San el-Hagar, Egypt'],
  tanis: ['San el-Hagar, Egypt'],
  pithom: ['Tell el-Maskhuta, Egypt', 'probable'],
  cyrene: ['Shahhat, Libya'],
  carthage: ['Carthage, Tunisia'],
  nubia: ['Northern Sudan'],
  cush: ['Sudan', 'probable'],
  ethiopia: ['Ethiopia'],
  ophir: ['Arabian Peninsula', 'probable'],
  sheba: ['Yemen', 'probable'],

  // Asia Minor and Greece
  ephesus: ['Selçuk, Turkey'],
  smyrna: ['İzmir, Turkey'],
  pergamum: ['Bergama, Turkey'],
  pergamos: ['Bergama, Turkey'],
  thyatira: ['Akhisar, Turkey'],
  sardis: ['Sart, Turkey'],
  philadelphia: ['Alaşehir, Turkey'],
  laodicea: ['Denizli, Turkey'],
  colossae: ['Honaz, Turkey'],
  troas: ['Dalyan, Turkey'],
  troy: ['Hisarlık, Turkey'],
  ilium: ['Hisarlık, Turkey'],
  miletus: ['Balat, Turkey'],
  halicarnassus: ['Bodrum, Turkey'],
  nicaea: ['İznik, Turkey'],
  nicomedia: ['İzmit, Turkey'],
  byzantium: ['Istanbul, Turkey'],
  constantinople: ['Istanbul, Turkey'],
  iconium: ['Konya, Turkey'],
  tarsus: ['Tarsus, Turkey'],
  derbe: ['Kerti Hüyük, Turkey', 'probable'],
  lystra: ['Hatunsaray, Turkey'],
  'antioch in pisidia': ['Yalvaç, Turkey'],
  galatia: ['Central Anatolia, Turkey'],
  cappadocia: ['Cappadocia, Turkey'],
  bithynia: ['Northwest Turkey'],
  cilicia: ['Southern Turkey'],
  lydia: ['Western Turkey'],
  phrygia: ['Western Anatolia, Turkey'],
  pamphylia: ['Antalya, Turkey'],
  lycia: ['Antalya, Turkey'],
  mysia: ['Northwest Turkey'],
  attalia: ['Antalya, Turkey'],
  perga: ['Perge, Turkey'],
  patmos: ['Patmos, Greece'],
  athens: ['Athens, Greece'],
  corinth: ['Corinth, Greece'],
  sparta: ['Sparta, Greece'],
  thessalonica: ['Thessaloniki, Greece'],
  philippi: ['Filippoi, Greece'],
  berea: ['Veria, Greece'],
  delphi: ['Delphi, Greece'],
  mycenae: ['Mycenae, Greece'],
  olympia: ['Olympia, Greece'],
  thermopylae: ['Thermopylae, Greece'],
  marathon: ['Marathon, Greece'],
  salamis: ['Salamis, Greece'],
  crete: ['Crete, Greece'],
  rhodes: ['Rhodes, Greece'],
  samos: ['Samos, Greece'],
  macedonia: ['Macedonia, Greece'],
  achaia: ['Southern Greece'],
  thrace: ['Thrace'],
  illyria: ['Western Balkans'],
  knossos: ['Knossos, Crete, Greece'],

  // Italy and the west
  rome: ['Rome, Italy'],
  ostia: ['Ostia Antica, Italy'],
  pompeii: ['Pompeii, Italy'],
  puteoli: ['Pozzuoli, Italy'],
  syracuse: ['Syracuse, Italy'],
  ravenna: ['Ravenna, Italy'],
  mediolanum: ['Milan, Italy'],
  etruria: ['Tuscany, Italy'],
  gaul: ['France'],
  lutetia: ['Paris, France'],
  massilia: ['Marseille, France'],
  hispania: ['Spain'],
  gades: ['Cádiz, Spain'],
  tarshish: ['Southern Spain', 'probable'],
  britannia: ['Great Britain'],
  londinium: ['London, England'],
  eboracum: ['York, England'],
  germania: ['Germany'],
  dacia: ['Romania'],
  pannonia: ['Hungary'],
  numidia: ['Northern Algeria'],
  mauretania: ['Morocco'],

  // Further east
  bactria: ['Northern Afghanistan'],
  sogdiana: ['Uzbekistan'],
  samarkand: ['Samarkand, Uzbekistan'],
  taxila: ['Taxila, Pakistan'],
  'indus': ['Indus River'],
  parthia: ['Northeastern Iran'],
  media: ['Northwestern Iran'],
  armenia: ['Armenia'],
  ararat: ['Mount Ararat, Turkey'],
  colchis: ['Western Georgia'],
  scythia: ['Pontic Steppe'],
  cathay: ['China'],
  'chang’an': ['Xi’an, China'],
  "chang'an": ['Xi’an, China'],
  changan: ['Xi’an, China'],
  khanbaliq: ['Beijing, China'],
  dadu: ['Beijing, China'],
  edo: ['Tokyo, Japan'],
  heian: ['Kyoto, Japan'],
  'heian-kyo': ['Kyoto, Japan'],
};

/**
 * Every sovereign country, which is the plainest case and the one the model
 * was being asked about most often. A few alternates come with them — a book
 * says `England` and `Burma` and `America`, and a reader does not want to be
 * told that none of those is a country.
 *
 * One string, split on the bar rather than on whitespace: a third of these
 * names have a space in the middle, and written out as quoted strings this is
 * two hundred lines of source for one list.
 */
const countries = new Set(
  `afghanistan|albania|algeria|andorra|angola|argentina|armenia|australia|austria|azerbaijan|bahamas|bahrain|bangladesh|barbados|belarus|belgium|belize|benin|bhutan|bolivia|bosnia and herzegovina|botswana|brazil|brunei|bulgaria|burkina faso|burundi|cambodia|cameroon|canada|chad|chile|china|colombia|comoros|congo|costa rica|croatia|cuba|cyprus|czechia|czech republic|denmark|djibouti|dominica|dominican republic|ecuador|egypt|el salvador|eritrea|estonia|eswatini|ethiopia|fiji|finland|france|gabon|gambia|georgia|germany|ghana|greece|grenada|guatemala|guinea|guinea-bissau|guyana|haiti|honduras|hungary|iceland|india|indonesia|iran|iraq|ireland|israel|italy|jamaica|japan|jordan|kazakhstan|kenya|kiribati|kosovo|kuwait|kyrgyzstan|laos|latvia|lebanon|lesotho|liberia|libya|liechtenstein|lithuania|luxembourg|madagascar|malawi|malaysia|maldives|mali|malta|mauritania|mauritius|mexico|moldova|monaco|mongolia|montenegro|morocco|mozambique|myanmar|burma|namibia|nauru|nepal|netherlands|new zealand|nicaragua|niger|nigeria|north korea|north macedonia|norway|oman|pakistan|palau|palestine|panama|papua new guinea|paraguay|peru|philippines|poland|portugal|qatar|romania|russia|rwanda|samoa|san marino|saudi arabia|senegal|serbia|seychelles|sierra leone|singapore|slovakia|slovenia|solomon islands|somalia|south africa|south korea|south sudan|spain|sri lanka|sudan|suriname|sweden|switzerland|syria|taiwan|tajikistan|tanzania|thailand|timor-leste|togo|tonga|trinidad and tobago|tunisia|turkey|turkmenistan|tuvalu|uganda|ukraine|united arab emirates|united kingdom|england|scotland|wales|united states|america|uruguay|uzbekistan|vanuatu|venezuela|vietnam|yemen|zambia|zimbabwe`.split(
    '|'
  )
);

/** `the`, and the one article that is not a place: `a`. */
const ARTICLE = /^(?:the|a)\s+/i;
/**
 * `the land of Egypt`, `the city of David`, `the wilderness of Zin`. What
 * follows `of` is the name; everything before it is how the book introduced
 * it, and a book of this sort introduces nearly everything.
 */
const OF = /^(?:land|city|isle|island|province|region|kingdom|valley|plain|wilderness|desert|mount|river|sea)\s+of\s+/i;
/**
 * Normalised rather than stripped, which is the difference between finding
 * `Mount Nebo` and looking for `Nebo`. The table keeps the mountains under
 * their full names because that is what a map wants to be given.
 */
const ABBREVIATED = /^mt\.?\s+/i;

/** Every form of a name worth looking for, nearest the book's wording first. */
function forms(name: string): string[] {
  const base = name.trim().replace(/\s+/g, ' ').replace(/[.,;:]+$/, '');
  const found: string[] = [];
  const add = (one: string) => {
    const clean = one.trim();
    if (clean && !found.includes(clean)) found.push(clean);
  };

  add(base);
  // Peeled one layer at a time: `the land of Egypt` is two of them.
  let peeled = base;
  for (let round = 0; round < 3; round += 1) {
    const next = peeled.replace(ARTICLE, '').replace(OF, '').trim();
    if (next === peeled) break;
    peeled = next;
    add(peeled);
  }
  for (const one of [...found]) add(one.replace(ABBREVIATED, 'Mount '));
  return found;
}

/**
 * The place a name refers to, or nothing.
 *
 * Nothing is not an error. A name the table has never heard of is still put to
 * a map search by hand, and a pin invented for it would be worse than none —
 * so an invented city stays unplaced and `Gormenghast` is left alone.
 */
export function placeNamed(name: string): Found | null {
  for (const candidate of forms(name)) {
    const key = candidate.toLowerCase();
    const ancient = ANCIENT[key];
    if (ancient) {
      return { modern: ancient[0], how: 'ancient', certainty: ancient[1] ?? 'certain' };
    }
    if (countries.has(key)) {
      // Its own name, spelled as the book spelled it: a map search wants
      // `Egypt`, not a normalised form of it.
      return { modern: candidate, how: 'country', certainty: 'certain' };
    }
  }
  return null;
}
