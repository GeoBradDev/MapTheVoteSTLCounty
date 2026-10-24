// The strict rules for whether typed address text names a known address,
// shared by every address source (src/data/geocoder.js). A match is never
// stretched into a guess: typed text must name the house number and the whole
// street (direction, name and type), and a typed ZIP or town must agree.
// An address here is plain fields: housenumber, street, postcode, city or
// district, county and state, as the source gives them, and for a county
// record its municipality (#143).

const STATE_ABBR = { Missouri: 'MO', Illinois: 'IL' };

// Spellings that name the same thing, so typed text and a source's names compare as
// one form. "saint" and "street" both become "st" on both sides alike.
export const CANONICAL = {
  street: 'st',
  saint: 'st',
  road: 'rd',
  avenue: 'ave',
  av: 'ave',
  drive: 'dr',
  boulevard: 'blvd',
  lane: 'ln',
  court: 'ct',
  place: 'pl',
  terrace: 'ter',
  parkway: 'pkwy',
  highway: 'hwy',
  circle: 'cir',
  trail: 'trl',
  square: 'sq',
  north: 'n',
  south: 's',
  east: 'e',
  west: 'w',
  northeast: 'ne',
  northwest: 'nw',
  southeast: 'se',
  southwest: 'sw',
  mount: 'mt',
  fort: 'ft',
  first: '1',
  second: '2',
  third: '3',
  fourth: '4',
  fifth: '5',
  sixth: '6',
  seventh: '7',
  eighth: '8',
  ninth: '9',
  tenth: '10',
  // Street types the county address points abbreviate (USPS forms).
  plaza: 'plz',
  crossing: 'xing',
  cove: 'cv',
  ridge: 'rdg',
  center: 'ctr',
  centre: 'ctr',
  point: 'pt',
  estates: 'est',
  meadows: 'mdws',
  meadow: 'mdw',
  heights: 'hts',
  hgts: 'hts',
  village: 'vlg',
  view: 'vw',
  manor: 'mnr',
  valley: 'vly',
  trace: 'trce',
  landing: 'lndg',
  gardens: 'gdns',
  expressway: 'expy',
  grove: 'grv',
  glen: 'gln',
  knolls: 'knls',
  knoll: 'knl',
  bend: 'bnd',
  creek: 'crk',
  green: 'grn',
  shore: 'shr',
  club: 'clb',
  forest: 'frst',
  fields: 'flds',
  corners: 'cors',
  mountain: 'mtn',
  haven: 'hvn',
  alley: 'aly',
  courts: 'cts',
  hill: 'hl',
};
// The county name locate() reads as St. Louis City.
export const CITY_COUNTY = 'St. Louis city';
// St. Louis in words() form.
export const ST_LOUIS = 'st louis';
export const DIRECTIONS = new Set(['n', 's', 'e', 'w', 'ne', 'nw', 'se', 'sw']);
// Street types, leaving out "st", which may start a city ("St. Louis").
export const STREET_TYPES = new Set(
  'rd ave dr blvd ln ct pl ter pkwy hwy cir trl sq way plz xing cv ctr expy trce lndg'.split(' '),
);

// Lower-case words in one spelling: ordinals as bare numbers (63rd -> 63),
// then the CANONICAL forms.
export function words(text) {
  return String(text ?? '')
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean)
    .map((word) => word.replace(/^(\d+)(st|nd|rd|th)$/, '$1'))
    .map((word) => (Object.hasOwn(CANONICAL, word) ? CANONICAL[word] : word));
}

export function labelOf(props) {
  const region = [STATE_ABBR[props.state] ?? props.state, props.postcode].filter(Boolean).join(' ');
  return [
    `${props.housenumber} ${props.street}`,
    props.city ?? props.district ?? props.county,
    region,
  ]
    .filter(Boolean)
    .join(', ');
}

// A source may give St. Louis City, an independent city, as a city with no
// county.
export function countyOf(props) {
  if (props.county) return props.county;
  if (props.state === 'Missouri' && words(props.city).join(' ') === ST_LOUIS) {
    return CITY_COUNTY;
  }
  return undefined;
}

// Whether a typed number names this house number: equal, one of a list
// ("12;14") or inside a range ("1200-1206").
function hasNumber(housenumber, typed) {
  return String(housenumber)
    .toLowerCase()
    .split(/[;,]/)
    .some((part) => {
      const value = part.trim();
      if (value === typed) return true;
      const range = value.match(/^(\d+)\s*-\s*(\d+)$/);
      const n = Number(typed);
      return Boolean(range) && /^\d+$/.test(typed) && n >= +range[1] && n <= +range[2];
    });
}

// The last ZIP typed after the house number, if any.
export function typedZip(text) {
  const zips = [...text.replace(/^\s*\S+/, '').matchAll(/\b(\d{5})(?:-\d{4})?\b/g)];
  return zips.at(-1)?.[1];
}

const NOT_TOWN = new Set(['mo', 'missouri', 'usa', 'us', 'united', 'states']);
// Unit words; when a unit number or letter follows one, both are dropped.
export const UNIT = new Set(
  'apt apartment unit ste suite bldg building fl floor rm room lot'.split(' '),
);
// Typed towns that name St. Louis, the mailing city for much of the county.
const ST_LOUIS_NAMES = new Set([ST_LOUIS, `${ST_LOUIS} city`]);

// A unit number has a digit ("2", "N230") or is one letter ("B"); a town has neither.
const isUnitNumber = (word) => /\d/.test(word ?? '') || word?.length === 1;

// The town in the words typed after the street, with or without commas:
// what is left once units ("Apt 2", "Unit 2-B"), the state, the country and
// numbers are dropped. "Ste Genevieve" is a town, not a suite, because no unit
// number follows "Ste"; a direction stays ("East St. Louis" is not St. Louis).
export function typedTown(after) {
  const kept = [];
  for (let i = 0; i < after.length; i += 1) {
    const word = after[i];
    if (UNIT.has(word) && isUnitNumber(after[i + 1])) {
      i += 1;
      // The letter of a unit like "2-B".
      if (/^\d/.test(after[i]) && after[i + 1]?.length === 1) i += 1;
    } else if (!/^\d/.test(word) && !NOT_TOWN.has(word)) kept.push(word);
  }
  return kept.join(' ');
}

/**
 * Whether typed text names this address's house number and whole street
 * (the first rule of matchesTyped), whatever its ZIP or town. A source uses it
 * to see every house the number and street could mean.
 */
export function matchesStreet(text, props) {
  if (words(text).join(' ') === words(labelOf(props)).join(' ')) return true;
  const [streetPart] = text.split(',');
  const [number, ...typed] = words(streetPart);
  if (!number || !/^\d/.test(number) || !hasNumber(props.housenumber, number)) return false;
  const street = words(props.street);
  if (!street.length || !street.every((word, i) => typed[i] === word)) return false;
  const next = typed[street.length];
  if (next && (DIRECTIONS.has(next) || STREET_TYPES.has(next))) return false;
  // "Elm St Louis" could be Elm Street in St. Louis or Elm (any type) in St. Louis.
  return !(street.at(-1) === 'st' && next === 'louis');
}

// Whether the typed town is the address's municipality (a county record's
// MSAG community, like Clayton for an address mailed as Saint Louis, #143).
const isMunicipality = (typedPlace, props) =>
  typedPlace && typedPlace === words(props.municipality).join(' ');

// Typed text names a feature when:
// - its street part (before the first comma) starts with the feature's house
//   number and then the feature's whole street, word for word, with no
//   direction or street type after it ("100 S Lindbergh Blvd" is not "100
//   Lindbergh Blvd", "8025 Maryland Ave Clayton" is not "8025 Clayton Rd");
// - a typed ZIP is the feature's postcode (a feature with no postcode cannot
//   confirm one unless its own town, not St. Louis, is typed), and a town
//   typed after the street, with or
//   without a comma, is the feature's town or municipality unless it is
//   St. Louis;
// - a feature in a named town other than St. Louis has that town or its ZIP
//   typed, since the same address can exist in two towns. St. Louis is the
//   mailing city for much of the county, so it confirms nothing.
// Typing a suggestion's own label back always matches.
// A source also needs every match to be one place before it answers.
export function matchesTyped(text, props) {
  if (words(text).join(' ') === words(labelOf(props)).join(' ')) return true;
  if (!matchesStreet(text, props)) return false;
  const street = words(props.street);

  const zip = typedZip(text);
  const postcode = props.postcode ? String(props.postcode).slice(0, 5) : null;
  if (zip && postcode && zip !== postcode) return false;
  const town = words(props.city ?? props.district).join(' ');
  // A house with no postcode cannot confirm a typed ZIP unless its own town,
  // other than St. Louis, is typed too.
  if (zip && !postcode && (!town || town === ST_LOUIS)) return false;
  const typedPlace = typedTown(words(text).slice(1 + street.length));
  // "St. Louis City" says the City, so a county result is not it.
  if (typedPlace === `${ST_LOUIS} city` && countyOf(props) !== CITY_COUNTY) return false;
  const isTown = typedPlace === town || isMunicipality(typedPlace, props);
  if (typedPlace && town && !isTown && !ST_LOUIS_NAMES.has(typedPlace)) return false;
  const confirmed = (zip && zip === postcode) || (typedPlace && isTown);
  return !town || town === ST_LOUIS || Boolean(confirmed);
}

/**
 * Whether typed text that matches an address (matchesTyped) also pins it
 * down: its ZIP is typed, or its town (not St. Louis) or municipality is typed. St. Louis
 * is the mailing city of much of the county and of St. Louis City, so it
 * confirms nothing.
 */
export function isConfirmed(text, props) {
  const zip = typedZip(text);
  const postcode = props.postcode ? String(props.postcode).slice(0, 5) : null;
  if (zip && zip === postcode) return true;
  const town = words(props.city ?? props.district).join(' ');
  const street = words(props.street);
  const typedPlace = typedTown(words(text).slice(1 + street.length));
  return (
    isMunicipality(typedPlace, props) ||
    Boolean(typedPlace && town && town !== ST_LOUIS && typedPlace === town)
  );
}

const UNIT_PATTERN = new RegExp(
  `(?:\\b(?:${[...UNIT].join('|')})\\b\\.?|#)\\s*([a-z0-9]+(?:-[a-z0-9]+)?)`,
  'gi',
);

/**
 * The last unit typed after the house number ("Apt 13B", "# 2-C"), as `13B`
 * or `2C`, or undefined.
 */
export function typedUnit(text) {
  const matches = [
    ...String(text ?? '')
      .replace(/^\s*\S+/, '')
      .matchAll(UNIT_PATTERN),
  ];
  return matches.at(-1)?.[1].replace(/-/g, '').toUpperCase();
}

/**
 * The town typed after this address's street, in words() form ("st louis",
 * "florissant", "st louis city"), or '' when none is typed.
 */
export function typedPlaceAfter(text, props) {
  return typedTown(words(text).slice(1 + words(props.street).length));
}
