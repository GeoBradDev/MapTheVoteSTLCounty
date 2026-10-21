// Checks the app's geocoder against live Photon and the live precinct layer.
// Each test address is a polling place from docs/raw/fixtures/polls.json. It is
// geocoded as typed text ("<street>, MO <zip>") with the app's own provider, and
// the precinct at the result is compared with the precinct at the county's own
// point for that site. "no match" is safe (the voter is sent to "Use my
// location" and the county's official lookup); a wrong precinct is not.
// Usage: node scripts/check-geocoder.mjs [base URL]   (default: public Photon)
// Exits 1 when any address lands in the wrong precinct.

import { readFile } from 'node:fs/promises';
import { getPrecinctAtPoint } from '../src/data/arcgis.js';
import { createPhotonGeocoder } from '../src/data/photon.js';

// North, south, west, central and unincorporated sites (docs/data.md, Geocoding).
const LOCS = ['144', '020', '002', '054', '041', '148', '158', '122', '096', '178'];

const polls = JSON.parse(
  await readFile(new URL('../docs/raw/fixtures/polls.json', import.meta.url), 'utf8'),
).features;
const geocoder = createPhotonGeocoder({ baseUrl: process.argv[2] });

const precinctAt = async (point) => (await getPrecinctAtPoint(point))?.precinct ?? 'outside';

let right = 0;
let none = 0;
const wrong = [];
for (const loc of LOCS) {
  const site = polls.find((p) => p.properties.loc === loc);
  if (!site) throw new Error(`No polling place ${loc} in the fixture`);
  const [lng, lat] = site.geometry.coordinates;
  const text = `${site.properties.address}, MO ${site.properties.zipcode}`;
  const want = await precinctAt({ lat, lng });
  const place = await geocoder.geocode(text);
  const got = place ? await precinctAt(place) : null;
  const firstSuggestion = (await geocoder.suggest(text.split(',')[0].slice(0, 14)))[0]?.label;
  if (!place) none += 1;
  else if (got === want) right += 1;
  else wrong.push(`${text}: ${got}, want ${want}`);
  console.log(
    `${text.padEnd(40)} want ${want.padEnd(7)} got ${String(got ?? 'no match').padEnd(9)} ` +
      `${place?.label ?? ''} | first suggestion: ${firstSuggestion ?? 'none'}`,
  );
  // Public Photon asks for fair use.
  await new Promise((resolve) => setTimeout(resolve, 300));
}

console.log(`${right} right, ${none} no match, ${wrong.length} wrong, of ${LOCS.length}`);
if (wrong.length) {
  console.error(`Wrong precinct:\n  ${wrong.join('\n  ')}`);
  process.exit(1);
}
