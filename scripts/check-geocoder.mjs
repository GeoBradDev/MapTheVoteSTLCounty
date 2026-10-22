// Checks address search (#7, #49) against the live services and the live
// precinct layer. Each test address is a polling place from
// docs/raw/fixtures/polls.json, geocoded as typed text ("<street>, MO <zip>"),
// and the precinct at the result is compared with the precinct at the county's
// own point for that site. 1318 Ross Ave (issue #49) is checked against CC007.
// Columns: each source alone (the county's live layer, its hosted copy,
// Photon), then the app's own chain (src/data/geocoder.js), then the chain
// with the live county layer blocked. A St. Louis City address must open a City
// precinct (#88). The City addresses of issue #58, whose house number and
// street the county also has in another ZIP, must open the City precinct with
// the City's ZIP and be no match with none, and a pick must open the
// jurisdiction its label names (owner decision, 2026-10-22); an address both
// list in one ZIP must be no match. The chain asks the City's own geocoder
// (src/data/cityAddress.js) before it trusts a county match, and as a source
// when the county has no match. "no match" is safe (the voter is sent to "Use my
// location" and the county's official lookup); a wrong precinct is not.
// Usage: node scripts/check-geocoder.mjs [photon base URL]   (default: public Photon)
// Exits 1 when any address lands in the wrong precinct with the app's chain
// or the blocked chain, a City address does not open its City precinct, an
// address outside both is put in a precinct, a pick does not open its label's
// jurisdiction, or an address both list in one ZIP or a twin typed with no
// ZIP is not no match, or gets a precinct while the City geocoder is down.

import { readFile } from 'node:fs/promises';
import { getPrecinctAtPoint } from '../src/data/arcgis.js';
import {
  createCountyAddressSource,
  HOSTED_TIMEOUT_MS,
  HOSTED_URL,
  LIVE_URL,
} from '../src/data/countyAddress.js';
import { createCityAddressCheck } from '../src/data/cityAddress.js';
import { createGeocoder } from '../src/data/geocoder.js';
import { GeocoderUnavailableError } from '../src/data/geocoderError.js';
import { createPhotonGeocoder } from '../src/data/photon.js';
import { locate } from '../src/features/lookup/locate.js';

// North, south, west, central and unincorporated sites (docs/data.md, Geocoding).
const LOCS = ['144', '020', '002', '054', '041', '148', '158', '122', '096', '178'];
const ROSS = { text: '1318 Ross Ave, Saint Louis, MO 63146', want: 'CC007' };
// St. Louis City Hall, a City address Photon lacks whose number and street the
// county also has in another ZIP (6135 Washington Ave 63112; the county's
// 63134, FER022), an owner report (5010 Nottingham Ave 63109) and addresses
// near the City line: a City precinct (#88).
const CITY = [
  '1200 Market St, St. Louis, MO 63103',
  '6135 Washington Ave, St. Louis, MO 63112',
  '5010 Nottingham Ave, St. Louis, MO 63109',
  '5010 Nottingham Ave St Louis MO',
  '5010 Nottingham Ave St. Louis, MO 63109',
  '6500 Chippewa St, St. Louis, MO 63109',
  '8900 Riverview Blvd, St. Louis, MO 63147',
];
// Outside the City and the county: never a precinct (no match is fine).
const ELSEWHERE = [
  '200 N 2nd St, St. Charles, MO 63301',
  '1600 Pennsylvania Ave NW, Washington, DC 20500',
  '1200 Market St, Philadelphia, PA 19107',
];
// The #58 twins the county and the City list in different ZIPs (6135 and
// 6109 Washington Ave), typed with no ZIP: no match, so the voter is asked for
// a ZIP, never either precinct (owner decision, 2026-10-22, #88).
const TWIN_NO_ZIP = [
  '6135 Washington Ave, St. Louis, MO',
  '6135 Washington Ave',
  '6109 Washington Ave',
  '6135 Washington Ave, St. Louis City',
];
// Addresses the county and the City both list in one ZIP (6135 Horton Pl
// 63133, UNV202; 1 Brookings Dr 63130, Washington University, HAD018): no
// match, never a county precinct (owner decision, #58).
const SHARED = [
  '6135 Horton Pl, St. Louis, MO 63133',
  '1 Brookings Dr',
  '1 Brookings Dr, St. Louis, MO 63130',
  '1 Brookings Dr, St. Louis City',
];
// Precincts pinned by owner reports and the #58 twins, checked exactly.
const PINNED = {
  '5010 Nottingham Ave, St. Louis, MO 63109': 'city W05P05',
  '5010 Nottingham Ave St Louis MO': 'city W05P05',
  '5010 Nottingham Ave St. Louis, MO 63109': 'city W05P05',
  '6135 Washington Ave, St. Louis, MO 63112': 'city W10P02',
};

const polls = JSON.parse(
  await readFile(new URL('../docs/raw/fixtures/polls.json', import.meta.url), 'utf8'),
).features;

const live = createCountyAddressSource({ url: LIVE_URL });
// The app's own timeouts, so the blocked column shows what a voter would get.
const hosted = createCountyAddressSource({ url: HOSTED_URL, timeoutMs: HOSTED_TIMEOUT_MS });
const photon = createPhotonGeocoder({ baseUrl: process.argv[2] });
// The live layer as a browser sees it when its firewall or network blocks it.
const blockedLive = createCountyAddressSource({
  url: LIVE_URL,
  fetch: () => Promise.reject(new TypeError('blocked')),
});
const cityCheck = createCityAddressCheck();
const app = createGeocoder({ sources: [live, hosted], fallback: photon, cityCheck });
const appBlocked = createGeocoder({ sources: [blockedLive, hosted], fallback: photon, cityCheck });

// Public Photon fails now and then; try again a few times before giving up.
async function withRetry(call) {
  for (let attempt = 1; ; attempt += 1) {
    try {
      return await call();
    } catch (error) {
      if (attempt === 3) throw error;
      await new Promise((resolve) => setTimeout(resolve, 2000 * attempt));
    }
  }
}

// "city <code>", "county <code>", another locate() kind, or "no match".
async function kindOf(place) {
  if (!place) return 'no match';
  const result = await locate(place);
  if (result.kind !== 'precinct') return result.kind;
  const code = result.precinct.code ?? result.precinct.precinct;
  return `${result.jurisdiction} ${code}`;
}

const precinctAt = async (point) => (await getPrecinctAtPoint(point))?.precinct ?? 'outside';

// One source's precinct for the text: a precinct, "none" or "down".
async function precinctFrom(geocode, text) {
  try {
    const place = await withRetry(() => geocode(text));
    return place ? await precinctAt(place) : 'none';
  } catch (error) {
    if (error instanceof GeocoderUnavailableError) return 'down';
    throw error;
  }
}

const countyGeocode = (source) => async (text) => {
  const result = await source.find(text);
  return result.status === 'match' ? result.place : null;
};

const columns = {
  live: countyGeocode(live),
  hosted: countyGeocode(hosted),
  photon: (text) => photon.geocode(text),
  app: (text) => app.geocode(text),
  'app, live blocked': (text) => appBlocked.geocode(text),
};

const cases = LOCS.map((loc) => {
  const site = polls.find((p) => p.properties.loc === loc);
  if (!site) throw new Error(`No polling place ${loc} in the fixture`);
  const [lng, lat] = site.geometry.coordinates;
  return { text: `${site.properties.address}, MO ${site.properties.zipcode}`, at: { lat, lng } };
});

const tally = Object.fromEntries(Object.keys(columns).map((c) => [c, { right: 0, none: 0 }]));
const wrong = [];
console.log(['address'.padEnd(40), 'want'.padEnd(7), ...Object.keys(columns)].join(' | '));
for (const item of [...cases, ROSS]) {
  const want = item.want ?? (await precinctAt(item.at));
  const row = [item.text.padEnd(40), want.padEnd(7)];
  for (const [name, geocode] of Object.entries(columns)) {
    const got = await precinctFrom(geocode, item.text);
    row.push(got);
    if (got === want) tally[name].right += 1;
    else if (got === 'none' || got === 'down') tally[name].none += 1;
    else if (name.startsWith('app')) wrong.push(`${name}: ${item.text}: ${got}, want ${want}`);
  }
  console.log(row.join(' | '));
  // Public Photon asks for fair use.
  await new Promise((resolve) => setTimeout(resolve, 300));
}

const total = cases.length + 1;
for (const [name, { right, none }] of Object.entries(tally)) {
  console.log(`${name}: ${right} right, ${none} no match or down, of ${total}`);
}

for (const [name, geocoder] of [
  ['app', app],
  ['app, live blocked', appBlocked],
]) {
  for (const text of CITY) {
    const place = await withRetry(() => geocoder.geocode(text));
    const kind = await kindOf(place);
    console.log(`${name}: ${text}: ${kind} (${place?.label ?? ''})`);
    if (!kind.startsWith('city ')) wrong.push(`${name}: ${text}: ${kind}, want a City precinct`);
    else if (PINNED[text] && kind !== PINNED[text]) {
      wrong.push(`${name}: ${text}: ${kind}, want ${PINNED[text]}`);
    }
  }
  for (const text of ELSEWHERE) {
    const place = await withRetry(() => geocoder.geocode(text));
    const kind = await kindOf(place);
    console.log(`${name}: ${text}: ${kind} (${place?.label ?? ''})`);
    if (/^(city|county) /.test(kind)) wrong.push(`${name}: ${text}: ${kind}, want no precinct`);
  }
  for (const text of [...SHARED, ...TWIN_NO_ZIP]) {
    const place = await withRetry(() => geocoder.geocode(text));
    const kind = await kindOf(place);
    console.log(`${name}: ${text}: ${kind} (${place?.label ?? ''})`);
    if (kind !== 'no match') wrong.push(`${name}: ${text}: ${kind}, want no match`);
  }
  // A voter who types the start of the address and picks a suggestion: the
  // first, the county's (labeled with its own town and ZIP), or the City's own
  // (#88), labeled "St. Louis City". A pick opens the jurisdiction its label
  // names (owner decision, 2026-10-22). A City or county pick must exist: no
  // such suggestion is a failure, not no match.
  for (const [partial, want, which] of [
    ['6135 Washington', 'county FER022', 'county'],
    ['6109 Washington', 'county FER022', 'county'],
    ['1 Brookings', 'no match', 'first'],
    ['6135 Washington', 'city', 'city'],
    ['1 Brookings', 'no match', 'city'],
    ['5010 Nottingham', 'city W05P05', 'city'],
    ['1200 Market St', 'city', 'city'],
    ['6500 Chippewa', 'city', 'city'],
    ['8900 Riverview', 'city', 'city'],
  ]) {
    const suggestions = await withRetry(() => geocoder.suggest(partial));
    const isCity = (s) => / St\. Louis City,/.test(s.label);
    const pick =
      which === 'city'
        ? suggestions.find(isCity)
        : which === 'county'
          ? suggestions.find((s) => !isCity(s))
          : suggestions[0];
    if (which !== 'first' && !pick) {
      wrong.push(`${name}: no ${which} suggestion for ${partial}`);
      continue;
    }
    const place = pick ? await withRetry(() => geocoder.geocode(pick)) : null;
    const kind = await kindOf(place);
    console.log(`${name}: pick "${pick?.label}" for ${partial}: ${kind} (${place?.label ?? ''})`);
    if (!kind.startsWith(want)) wrong.push(`${name}: pick for ${partial}: ${kind}, want ${want}`);
  }
}

// The City geocoder down: an address both list, or a twin typed with no ZIP,
// must never get a precinct (#58, #88).
const cityDown = createGeocoder({
  sources: [live, hosted],
  fallback: photon,
  cityCheck: createCityAddressCheck({ fetch: () => Promise.reject(new TypeError('blocked')) }),
});
for (const text of [...SHARED, ...TWIN_NO_ZIP]) {
  const place = await withRetry(() => cityDown.geocode(text));
  const kind = await kindOf(place);
  console.log(`app, City down: ${text}: ${kind} (${place?.label ?? ''})`);
  if (/^(city|county) /.test(kind))
    wrong.push(`app, City down: ${text}: ${kind}, want no precinct`);
}

if (wrong.length) {
  console.error(`Wrong:\n  ${wrong.join('\n  ')}`);
  process.exit(1);
}
