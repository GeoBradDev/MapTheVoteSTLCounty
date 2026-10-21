// An address source backed by St. Louis County's own address points (issue
// #49), the official list of every address in the county, queried straight
// from the browser: no proxy, no server of ours, no key. The address goes only
// in a POST body (never a URL), with no cookies, no referrer and no browser
// cache. The server filter is loose on purpose (the house number plus one
// street word); the strict rules in addressMatch.js then decide in the
// browser, so a typed address never resolves to another house. Every failure
// becomes a GeocoderUnavailableError, so src/data/geocoder.js can try the next
// source.
import {
  CANONICAL,
  DIRECTIONS,
  isConfirmed,
  labelOf,
  matchesTyped,
  STREET_TYPES,
  typedUnit,
  typedZip,
  UNIT,
  words,
} from './addressMatch.js';
import { GeocoderUnavailableError } from './geocoderError.js';

/** The county's live address layer, edited daily. */
export const LIVE_URL =
  'https://maps.stlouisco.com/hosting/rest/services/Maps/ASR_Address_Points/FeatureServer/0';
/** The county's hosted copy on ArcGIS Online, last edited 2023-02. */
export const HOSTED_URL =
  'https://services2.arcgis.com/w657bnjzrjguNyOy/arcgis/rest/services/Address_Points/FeatureServer/2';

/** Who to credit for the address data, shown next to the address box. */
export const attribution = Object.freeze({
  data: 'address points',
  by: 'St. Louis County',
  url: 'https://www.arcgis.com/home/item.html?id=cf0a5470fca14004baee67da7746cdbf',
});

/** How long one request may take before the lookup moves to the next source. */
export const TIMEOUT_MS = 2500;
/** The hosted copy is the last county source, so it gets a little longer. */
export const HOSTED_TIMEOUT_MS = 3000;
/**
 * How many records a find may return: an apartment complex can have over 300
 * units at one number. More means the filter was too loose.
 */
const FIND_LIMIT = 1000;
// Units of one building fill the list, so ask for more than we show.
const SUGGEST_LIMIT = 25;
const MAX_SUGGESTIONS = 5;
// About 300 m: the units of one apartment complex, which share a number.
const SAME_SITE_DEGREES = 0.003;

const OUT_FIELDS = [
  'OBJECTID',
  'ADRNO',
  'ADRDIR',
  'ADRSTR',
  'ADRSUF',
  'UNITDESC',
  'UNITNO',
  'MAILINGCITY',
  'ZIPCODE',
  'FULL_ADDRESS',
  'STATUS',
].join(',');
const CURRENT = "STATUS = 'Current'";
const MAX_HOUSE_NUMBER_DIGITS = 6;

// Every spelling of a word that words() turns into one form: "mt" asks for
// MOUNT and MT, since the county writes MOUNT OLIVE but ST LOUIS GALLERIA.
const SPELLINGS = new Map();
for (const [spelling, canonical] of Object.entries(CANONICAL)) {
  if (!SPELLINGS.has(canonical)) SPELLINGS.set(canonical, new Set([canonical]));
  SPELLINGS.get(canonical).add(spelling);
}

// Words that need no spelling variants: not a key or value of CANONICAL.
const isPlain = (word) => !(word in CANONICAL) && !SPELLINGS.has(word) && /^[a-z]+$/.test(word);
const isType = (word) => STREET_TYPES.has(word) || word === 'st';

function abortError() {
  return new DOMException('The operation was aborted.', 'AbortError');
}

// Lower-case tokens of the street part: before the first comma, split on
// anything but letters and digits, so no quote or wildcard survives.
function tokens(text) {
  return String(text ?? '')
    .split(',')[0]
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
}

function houseNumber(token) {
  const pattern = new RegExp(`^\\d{1,${MAX_HOUSE_NUMBER_DIGITS}}$`);
  return pattern.test(token ?? '') ? Number(token) : null;
}

// The county spellings, upper case, to look for in ADRSTR for one typed word.
function spellingsOf(word) {
  const canonical = words(word)[0];
  if (/^\d+$/.test(canonical)) return [canonical];
  const all = [word, ...(SPELLINGS.get(canonical) ?? [canonical])];
  return [...new Set(all.map((w) => w.toUpperCase()))].filter((w) => /^[A-Z0-9]+$/.test(w));
}

// The word of a typed street to look for: the first plain word, else the
// first that is not a street type, leaving out a trailing street type (the
// county keeps it in ADRSUF) and a ZIP. A town or ZIP typed with no comma
// follows the street, so the first word is the safe one.
function streetWord(street) {
  const candidates = street.filter(
    (word, i) => !/^\d{5}$/.test(word) && !(i === street.length - 1 && isType(words(word)[0])),
  );
  return candidates.find(isPlain) ?? candidates.find((word) => !isType(words(word)[0]));
}

/**
 * The where clause that finds the typed house: its number, current records
 * only, and one street word anywhere in ADRSTR. It is built only from a
 * validated integer and `[A-Z0-9]` words, so typed text cannot change the
 * query. Null when the text has no house number or no street word.
 * @param {string} text
 * @returns {string | null}
 */
export function findWhere(text) {
  const [first, ...rest] = tokens(text);
  const number = houseNumber(first);
  if (number === null) return null;
  // The street: up to a unit word, without a leading direction (ADRDIR)
  // unless that is the street's name ("East Ln").
  const unitAt = rest.findIndex((word) => UNIT.has(word));
  const street = unitAt === -1 ? rest : rest.slice(0, unitAt);
  const key =
    streetWord(street.slice(DIRECTIONS.has(words(street[0])[0]) ? 1 : 0)) ??
    streetWord(street) ??
    // A street named for a street type ("Plaza Dr", "Center Ave"): any word
    // but the last, which is its type.
    street.slice(0, -1).find((word) => !/^\d{5}$/.test(word));
  if (!key) return null;
  const likes = spellingsOf(key).map((spelling) => `ADRSTR LIKE '%${spelling}%'`);
  return `ADRNO = ${number} AND ${CURRENT} AND (${likes.join(' OR ')})`;
}

// Typed words in the county's spelling, for a prefix of FULL_ADDRESS.
const COUNTY_SPELLING = {
  street: 'st',
  saint: 'st',
  avenue: 'ave',
  av: 'ave',
  road: 'rd',
  drive: 'dr',
  boulevard: 'blvd',
  lane: 'ln',
  court: 'ct',
  place: 'pl',
  terrace: 'ter',
  parkway: 'pkwy',
  circle: 'cir',
  trail: 'trl',
  square: 'sq',
  plaza: 'plz',
  crossing: 'xing',
  mt: 'mount',
  ft: 'fort',
  first: '1st',
  second: '2nd',
  third: '3rd',
  fourth: '4th',
  fifth: '5th',
  sixth: '6th',
  seventh: '7th',
  eighth: '8th',
  ninth: '9th',
  tenth: '10th',
};
const DIRECTION_SPELLING = { north: 'n', south: 's', east: 'e', west: 'w' };

/**
 * The where clause for suggestions: current records whose FULL_ADDRESS
 * starts with the typed street part, in the county's spelling, and a typed
 * ZIP if any. A short last word is left as typed while it may still be partial.
 * Null when the text does not start with a house number.
 * @param {string} text
 * @returns {string | null}
 */
export function suggestWhere(text) {
  const raw = String(text ?? '');
  const streetPart = raw.split(',')[0];
  const parts = tokens(streetPart);
  if (!/^\d/.test(parts[0] ?? '')) return null;
  const lastIsWhole = /[^a-z0-9]$/i.test(streetPart) || raw.includes(',');
  const spelled = parts.map((word, i) => {
    // A short last word may still be partial ("Av" of "Avalon"); a long one
    // in the list is whole ("Avenue").
    if (i === parts.length - 1 && !lastIsWhole && word.length < 5) return word;
    if (i === 1 && parts.length > 2 && DIRECTION_SPELLING[word]) return DIRECTION_SPELLING[word];
    return COUNTY_SPELLING[word] ?? word;
  });
  const prefix = `${spelled.join(' ').toUpperCase()}${/\s$/.test(streetPart) ? ' ' : ''}`;
  const zip = raw.includes(',') ? typedZip(raw) : undefined;
  return `${CURRENT} AND FULL_ADDRESS LIKE '${prefix}%'${zip ? ` AND ZIPCODE = '${zip}'` : ''}`;
}

// "SAINT LOUIS" as "Saint Louis", "1ST" as "1st"; unit numbers stay as given.
function titleCase(value) {
  return String(value ?? '')
    .trim()
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .map((word) => (/^[a-z]/.test(word) ? word[0].toUpperCase() + word.slice(1) : word))
    .join(' ');
}

const text = (value) => (typeof value === 'string' ? value.trim() : '');

// A usable county record: current, an integer house number, a street and a
// point. `props` has the fields addressMatch.js reads.
function recordOf(feature) {
  const a = feature?.attributes;
  const { x, y } = feature?.geometry ?? {};
  if (!a || a.STATUS !== 'Current' || !Number.isFinite(x) || !Number.isFinite(y)) return null;
  if (!Number.isInteger(a.ADRNO) || a.ADRNO < 0 || !text(a.ADRSTR)) return null;
  const direction = text(a.ADRDIR).toUpperCase();
  const street = [direction, titleCase(a.ADRSTR), titleCase(a.ADRSUF)].filter(Boolean).join(' ');
  const props = {
    housenumber: String(a.ADRNO),
    street,
    postcode: text(a.ZIPCODE) || undefined,
    city: titleCase(a.MAILINGCITY) || undefined,
    state: 'Missouri',
    county: 'Saint Louis County',
  };
  const unitNo = text(a.UNITNO).toUpperCase();
  const unit = unitNo ? `${titleCase(a.UNITDESC) || 'Unit'} ${unitNo}` : '';
  return { props, lat: y, lng: x, unit, unitKey: unitNo.replace(/-/g, '') };
}

/** @returns {import('./geocoder.js').GeocodedPlace} */
function placeOf(record, { withUnit = false } = {}) {
  const { props, lat, lng, unit } = record;
  const street = withUnit && unit ? `${props.street} ${unit}` : props.street;
  const label = labelOf({ ...props, street });
  return { lat, lng, state: props.state, county: props.county, label };
}

// The same street address and ZIP: the units of one building.
const siteKey = ({ props }) =>
  `${props.housenumber}|${words(props.street).join(' ')}|${props.postcode ?? ''}`;

const near = (a, b) =>
  Math.abs(a.lat - b.lat) <= SAME_SITE_DEGREES && Math.abs(a.lng - b.lng) <= SAME_SITE_DEGREES;

/**
 * @typedef {{ status: 'match', place: import('./geocoder.js').GeocodedPlace, confirmed: boolean }
 *   | { status: 'none' } | { status: 'ambiguous' }} FindResult
 *   `confirmed` is true when a typed ZIP or town (not St. Louis) pins the
 *   match down; see isConfirmed in addressMatch.js.
 */

/**
 * @param {{ url: string, fetch?: typeof fetch, timeoutMs?: number }} options
 */
export function createCountyAddressSource({
  url,
  fetch = (...args) => globalThis.fetch(...args),
  timeoutMs = TIMEOUT_MS,
}) {
  const queryUrl = `${url.replace(/\/+$/, '')}/query`;

  async function query(params, signal) {
    if (signal?.aborted) throw abortError();
    const body = new URLSearchParams({
      ...params,
      outFields: OUT_FIELDS,
      returnGeometry: 'true',
      outSR: '4326',
      f: 'json',
    });
    const controller = new AbortController();
    const onAbort = () => controller.abort();
    signal?.addEventListener('abort', onAbort, { once: true });
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, timeoutMs);
    try {
      const response = await fetch(queryUrl, {
        method: 'POST',
        body,
        signal: controller.signal,
        cache: 'no-store',
        credentials: 'omit',
        referrerPolicy: 'no-referrer',
      });
      if (!response.ok) {
        throw new GeocoderUnavailableError(`County addresses answered HTTP ${response.status}`);
      }
      const json = await response.json();
      if (json?.error || !Array.isArray(json?.features)) {
        throw new GeocoderUnavailableError('County addresses gave an unexpected answer');
      }
      return json;
    } catch (error) {
      if (signal?.aborted) throw abortError();
      if (error instanceof GeocoderUnavailableError) throw error;
      // Never the original error: its message could carry the address.
      throw new GeocoderUnavailableError(
        timedOut ? 'County addresses timed out' : 'County addresses could not be reached',
      );
    } finally {
      clearTimeout(timer);
      signal?.removeEventListener('abort', onAbort);
    }
  }

  return Object.freeze({
    /**
     * The county record the text names.
     * @param {string} input
     * @param {{ signal?: AbortSignal }} [options]
     * @returns {Promise<FindResult>}
     */
    async find(input, { signal } = {}) {
      const typed = String(input ?? '').trim();
      const where = findWhere(typed);
      if (!where) {
        if (signal?.aborted) throw abortError();
        return { status: 'none' };
      }
      const json = await query(
        { where, orderByFields: 'OBJECTID', resultRecordCount: String(FIND_LIMIT) },
        signal,
      );
      // A cut-off answer may hide a second address that fits: no answer.
      if (json.exceededTransferLimit) {
        throw new GeocoderUnavailableError('County addresses gave too many records');
      }
      const matches = json.features
        .map(recordOf)
        .filter((record) => record && matchesTyped(typed, record.props));
      if (!matches.length) return { status: 'none' };
      // Two addresses fit (two ZIPs or two streets): asking for a ZIP beats
      // guessing.
      const [first] = matches;
      if (!matches.every((m) => siteKey(m) === siteKey(first))) return { status: 'ambiguous' };
      // One address: the typed unit's point, else the address's own point
      // (the record with no unit), else its units' point when they are close
      // together. Units spread over a large parcel, with no point of the
      // address itself, could be in two precincts.
      const unit = typedUnit(typed);
      const ownUnit = unit && matches.find((m) => m.unitKey === unit);
      const chosen = ownUnit ?? matches.find((m) => !m.unitKey);
      if (!chosen && !matches.every((m) => near(m, first))) return { status: 'ambiguous' };
      return {
        status: 'match',
        place: placeOf(chosen ?? first, { withUnit: Boolean(ownUnit) }),
        confirmed: isConfirmed(typed, (chosen ?? first).props),
      };
    },

    /**
     * Up to five county addresses starting with the text. Each carries its
     * place, so geocoding a pick sends nothing.
     * @param {string} input
     * @param {{ signal?: AbortSignal }} [options]
     * @returns {Promise<import('./geocoder.js').Suggestion[]>}
     */
    async suggest(input, { signal } = {}) {
      const typed = String(input ?? '').trim();
      const where = suggestWhere(input);
      if (!typed || !where) {
        if (signal?.aborted) throw abortError();
        return [];
      }
      const json = await query(
        { where, orderByFields: 'FULL_ADDRESS', resultRecordCount: String(SUGGEST_LIMIT) },
        signal,
      );
      // Units only when one is being typed; else one entry per building.
      const showUnits = tokens(typed).some((word) => UNIT.has(word)) || typed.includes('#');
      const seen = new Set();
      const suggestions = [];
      for (const feature of json.features) {
        const record = recordOf(feature);
        if (!record) continue;
        const place = placeOf(record, { withUnit: showUnits });
        if (seen.has(place.label)) continue;
        seen.add(place.label);
        suggestions.push({
          id: `county-${feature.attributes.OBJECTID ?? ''}-${suggestions.length}`,
          label: place.label,
          place,
        });
        if (suggestions.length === MAX_SUGGESTIONS) break;
      }
      return suggestions;
    },
  });
}
