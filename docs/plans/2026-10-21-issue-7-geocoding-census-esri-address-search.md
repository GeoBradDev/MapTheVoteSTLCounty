# Plan: Geocoding with Photon and address search with autocomplete (issue #7)

Status: owner decided 2026-10-21; build on this branch.

Risk tier: High. Address text is the most sensitive data the app handles, and this code
decides where it goes (privacy, forced High as a security control). The provider talks to a
third-party service whose failures must never turn into a guessed precinct.

Domain skills:
- superpowers:test-driven-development: invoke.
- vercel-react-best-practices: invoke for the attribution component and the stable provider.
- frontend-design: not applicable because the landing screen layout is #10; this adds one
  line of attribution with existing tokens.
- context7 (docs lookup): not applicable because no library is added; Photon is plain HTTP.
- expo, django, django-ninja, fastapi, claude-api, dataviz: not applicable because none of
  those stacks are involved.

Mode: commit. The owner authorized commits, pushing this issue branch, the PR and its squash
merge for this run.

## Decision

The owner chose the public Photon API (https://photon.komoot.io), called directly from the
browser. Frontend only: no proxy, no server, no self-hosting, no Esri, no API keys. Esri was
dropped (its terms need an account and token); Census has no CORS and no suggest; public
Nominatim forbids client-side autocomplete in its usage policy.

## Spike results

Recorded in `docs/data.md` under Geocoding. Summary:
- Census Geocoder: no CORS header on GET or preflight, so a browser `fetch` is blocked; no
  suggest operation. Not usable without a proxy, and a proxy would put address text on a
  server of ours, which the issue forbids.
- Esri World Geocoder: CORS allowed; `suggest` and `findAddressCandidates` work; 10 of 10
  test addresses resolved to the county's own precinct (Census 9 of 10).
- Esri's terms require an ArcGIS Location Platform or ArcGIS Online account and an access
  token. Anonymous requests work today but are not permitted by those terms.
- The county's private utility proxy (`utility.arcgis.com/usrsvcs/servers/d5419f11...`) was
  not used.

## Acceptance criteria

1. `src/data/photon.js` exports `createPhotonGeocoder({ baseUrl, fetch, timeoutMs })`, which
   returns a frozen object implementing the #10 interface in `src/data/geocoder.js`:
   `suggest(text, { signal })` and `geocode(suggestionOrText, { signal })`. `geocoder.js`
   default-exports one instance created at module load (stable across renders), with the
   base URL from `VITE_GEOCODER_URL`, default `https://photon.komoot.io`.
2. Requests carry `q`, `limit`, `lang=en`, a `bbox` of the county extent
   (`-90.74,38.39,-90.11,38.89`, which also covers St. Louis City) and a `lat`/`lon` bias.
   Only results with a house number in the US are returned, so a street or area centroid is
   never used as an address.
3. `geocode` returns `{ lat, lng, state, county, label }` (Photon `state`, `county`; when
   Photon gives no county for a Missouri place whose city is Saint Louis, county is
   `St. Louis city`, the independent city), or `null` when nothing matches. For typed text
   the typed street part (before the first comma) must start with the match's house number
   and then its whole street, word for word, with the same direction and street type
   (spellings like Road/Rd, South/S, Saint/St, Mount/Mt, First/1st compare as one), and a
   typed ZIP must be its postcode (a St. Louis City match with no postcode cannot confirm
   one) and a town typed after the street, with or without a comma, its town unless it is
   St. Louis (units with a unit number, the state, the country and numbers are not part of
   the town, a direction is; "St. Louis City" must be a City result); a match in
   a named town other than St. Louis needs that town or its ZIP typed; typing a suggestion's
   own label back always matches; otherwise `null`. A picked suggestion geocodes from the suggestion with no second
   request.
4. A timeout (8 s), network error, non-2xx (429 included) or malformed body rejects with
   `GeocoderUnavailableError`; a caller abort rejects with an AbortError. The lookup then
   shows a message pointing to "Use my location" and the county's official lookup. No
   precinct is guessed.
5. Debounce (250 ms, 3 characters) and cancelling stale requests stay as built in #10; the
   provider passes the caller's signal to `fetch`.
6. Address text goes only to Photon: requests use `cache: 'no-store'`, `credentials: 'omit'`
   and `referrerPolicy: 'no-referrer'`; nothing is written to storage or the URL (existing
   AddressLookup tests keep covering that).
7. The lookup shows "Address search: Photon by komoot. Data © OpenStreetMap contributors.",
   with the OSM link to https://www.openstreetmap.org/copyright, followed by "Your address is
   sent only to that service, to find your precinct. This site does not save it." Photon's
   site asks for fair use, not a credit; the komoot credit is kept anyway so voters can see
   where the address goes. The sentence says nothing about what Photon itself keeps, which
   we do not control.
8. `scripts/check-geocoder.mjs` geocodes the 10 test addresses with the app's own provider
   against live Photon and checks the precinct at each point; `docs/data.md` records the
   result next to the Esri and Census table, plus the Nominatim evaluation.
9. If a CSP exists on main when this ships, `connect-src` allows `https://photon.komoot.io`.

## Files that change

- `src/data/photon.js`, `src/data/photon.test.js` (new).
- `src/data/geocoder.js`, `src/data/geocoder.test.js`: default export is the Photon
  instance; the "names no provider" test becomes "only the provider module names a provider
  host, and no API key anywhere".
- `src/features/lookup/GeocoderAttribution.jsx` and test, `AddressLookup.jsx`,
  `lookupCopy.js` (noMatch and unavailable messages mention "Use my location").
- `src/data/geocoderError.js` (new): the error class, so `geocoder.js` and `photon.js` do
  not import each other.
- `src/features/lookup/locate.js`: comments only, county and state examples no longer name
  providers.
- `src/test/render.test.js`: reads the Photon origin from `src/data/photon.js` (the CSP from
  #31 already allows it, criterion 9).
- `scripts/check-geocoder.mjs`, `docs/data.md`, `README.md` (Address search section), this
  plan.

## Order of work

1. Photon provider with tests (fake fetch). 2. Wire as default geocoder. 3. Copy and
attribution. 4. Live check script and docs. 5. Live drive in a browser.

## Risks

- Public Photon is best effort and throttles heavy use; Election Day load could hit it. The
  fallback messages and "Use my location" cover that; self-hosting was ruled out by the owner.
- 6915 Weber Rd has no house-level match in OSM; that address gets the not-found message.
- Photon fuzzy matching can return a nearby house with another number, or the typed number
  on another street; the house number, street and ZIP checks on typed text return null
  instead (review findings: a typed city word must not satisfy the street check, and a
  different direction or street type is another street; frozen tests
  `src/data/photon.strict.test.js`, `src/data/photon.street.test.js` and, for the same
  address in another town, `src/data/photon.town.test.js` and
  `src/data/photon.typedtown.test.js`, `src/data/photon.unit.test.js`, `src/data/photon.direction.test.js`). A result Photon gives with no town (unincorporated
  county) is accepted on house number, street and any typed ZIP alone. A voter who leaves out the
  street type, or the town and ZIP of an address in a named town, gets no match and is
  told to add the ZIP or pick a suggestion.

## Proof

Build: `src/data/photon.test.js` covers criteria 1 to 6 with a fake fetch;
`src/data/geocoder.test.js` covers the provider-name and key guard;
`GeocoderAttribution.test.jsx` and `AddressLookup.test.jsx` cover 4 and 7. Criterion 8 is
`node scripts/check-geocoder.mjs` against live Photon and the live precinct layer. The live
drive types an address in the dev server, picks a suggestion and lands on its precinct page,
and checks the request goes only to photon.komoot.io with CORS allowed.

Spike (Census and Esri, before the decision), script run 2026-10-21 with Node 24 from the
repo root:

```js
import election from '../../src/config/election.js';
import { readFileSync } from 'node:fs';
const polls = JSON.parse(readFileSync('../../docs/raw/fixtures/polls.json','utf8')).features;
const locs = ['144','020','002','054','041','148','158','122','096','178'];
const tests = locs.map(l => { const f = polls.find(p=>p.properties.loc===l); const [lng,lat]=f.geometry.coordinates; return { label: `${f.properties.name}`, text: `${f.properties.address}, ${f.properties.zipcode}`, ref: {lat,lng} }; });
tests.push({ label: 'Apartment (unit)', text: '8025 Maryland Ave Unit 5A, Clayton, MO 63105' });
tests.push({ label: 'Apartment (unit)', text: '7536 Forsyth Blvd Apt 2, Clayton, MO 63105' });
const ext = '-90.74,38.39,-90.11,38.89';
async function precinctAt(p){ if(!p) return null; const u=`${election.serviceRoot}/${election.layers.precincts}/query?`+new URLSearchParams({geometry:`${p.lng},${p.lat}`,geometryType:'esriGeometryPoint',inSR:'4326',spatialRel:'esriSpatialRelIntersects',outFields:'precinct',returnGeometry:'false',f:'json'}); const b=await (await fetch(u)).json(); return b.features?.[0]?.attributes.precinct ?? 'outside'; }
async function esri(text){ const u='https://geocode.arcgis.com/arcgis/rest/services/World/GeocodeServer/findAddressCandidates?'+new URLSearchParams({SingleLine:text,f:'json',countryCode:'USA',searchExtent:ext,maxLocations:'1',outFields:'Addr_type,Score',outSR:'4326'}); const b=await (await fetch(u)).json(); const c=b.candidates?.[0]; return c?{lat:c.location.y,lng:c.location.x,addr:c.address,type:c.attributes.Addr_type,score:c.score}:null; }
async function census(text){ const u='https://geocoding.geo.census.gov/geocoder/locations/onelineaddress?'+new URLSearchParams({address:text.includes('MO')?text:text.replace(/, (\d{5})$/,', MO $1'),benchmark:'Public_AR_Current',format:'json'}); const b=await (await fetch(u)).json(); const c=b.result?.addressMatches?.[0]; return c?{lat:c.coordinates.y,lng:c.coordinates.x,addr:c.matchedAddress}:null; }
async function suggest(text){ const u='https://geocode.arcgis.com/arcgis/rest/services/World/GeocodeServer/suggest?'+new URLSearchParams({text,f:'json',countryCode:'USA',searchExtent:ext,category:'Address',maxSuggestions:'5'}); const b=await (await fetch(u)).json(); return b.suggestions?.map(s=>s.text) ?? b; }
for (const t of tests){
  const [e,c] = await Promise.all([esri(t.text), census(t.text)]);
  const [pr,pe,pc] = await Promise.all([precinctAt(t.ref),precinctAt(e),precinctAt(c)]);
  const partial = t.text.split(',')[0].slice(0, 14);
  const sug = await suggest(partial);
  console.log(JSON.stringify({label:t.label,text:t.text,refPrecinct:pr,esri:e&&{addr:e.addr,type:e.type,score:e.score,precinct:pe},census:c&&{addr:c.addr,precinct:pc},suggestFor:partial,firstSuggestion:Array.isArray(sug)?sug[0]:sug, suggestionCount:Array.isArray(sug)?sug.length:0}));
}
```

Output:

```
{"label":"ROGERS ELEMENTARY SCHOOL","text":"7700 FINE RD, 63129","refPrecinct":"OAK019","esri":{"addr":"7700 Fine Rd, Saint Louis, Missouri, 63129","type":"PointAddress","score":100,"precinct":"OAK019"},"census":{"addr":"7700 FINE RD, SAINT LOUIS, MO, 63129","precinct":"OAK019"},"suggestFor":"7700 FINE RD","firstSuggestion":"7700 Fine Rd, Saint Louis, MO, 63129, USA","suggestionCount":1}
{"label":"BOWLES ELEMENTARY SCHOOL","text":"501 BOWLES AVE, 63026","refPrecinct":"MER025","esri":{"addr":"501 Bowles Ave, Fenton, Missouri, 63026","type":"PointAddress","score":100,"precinct":"MER025"},"census":{"addr":"501 BOWLES AVE, FENTON, MO, 63026","precinct":"MER025"},"suggestFor":"501 BOWLES AVE","firstSuggestion":"501 Bowles Ave, Fenton, MO, 63026, USA","suggestionCount":1}
{"label":"AFFTON PAT","text":"6915 WEBER RD, 63123","refPrecinct":"GRA045","esri":{"addr":"6915 Weber Rd, Saint Louis, Missouri, 63123","type":"PointAddress","score":100,"precinct":"GRA045"},"census":{"addr":"6915 WEBER RD, SAINT LOUIS, MO, 63123","precinct":"GRA045"},"suggestFor":"6915 WEBER RD","firstSuggestion":"6915 Weber Rd, Saint Louis, MO, 63123, USA","suggestionCount":2}
{"label":"FIRST EVANGELICAL FREE CHURCH","text":"1375 CARMAN RD, 63021","refPrecinct":"MR018","esri":{"addr":"1375 Carman Rd, Ballwin, Missouri, 63021","type":"PointAddress","score":100,"precinct":"MR018"},"census":{"addr":"1375 CARMAN RD, BALLWIN, MO, 63021","precinct":"MR018"},"suggestFor":"1375 CARMAN RD","firstSuggestion":"1375 Carman Rd, Ballwin, MO, 63021, USA","suggestionCount":1}
{"label":"DES PERES CITY HALL","text":"12325 MANCHESTER RD, 63131","refPrecinct":"MR006","esri":{"addr":"12325 Manchester Rd, Saint Louis, Missouri, 63131","type":"PointAddress","score":100,"precinct":"MR006"},"census":{"addr":"12325 MANCHESTER RD, SAINT LOUIS, MO, 63131","precinct":"MR006"},"suggestFor":"12325 MANCHEST","firstSuggestion":"12325 Manchester Rd, Saint Louis, MO, 63131, USA","suggestionCount":1}
{"label":"SAINT LOUIS GALLERIA","text":"1417 ST LOUIS GALLERIA ST, 63117","refPrecinct":"CLA019","esri":{"addr":"1417 Saint Louis Galleria, Saint Louis, Missouri, 63117","type":"PointAddress","score":96.59,"precinct":"CLA019"},"census":{"addr":"1417 ST LOUIS GALLERIA ST, SAINT LOUIS, MO, 63117","precinct":"CLA020"},"suggestFor":"1417 ST LOUIS ","firstSuggestion":"1417 Saint Louis Galleria, Saint Louis, MO, 63117, USA","suggestionCount":3}
{"label":"ST LOUIS FAMILY CHURCH - YOUTH BUILDING","text":"17476 CHESTERFIELD AIRPORT RD, 63005","refPrecinct":"CHE002","esri":{"addr":"17476 Chesterfield Airport Rd, Chesterfield, Missouri, 63005","type":"PointAddress","score":100,"precinct":"CHE002"},"census":{"addr":"17476 CHESTERFIELD AIRPORT RD, CHESTERFIELD, MO, 63005","precinct":"CHE002"},"suggestFor":"17476 CHESTERF","firstSuggestion":"17476 Chesterfield Airport Rd, Chesterfield, MO, 63005, USA","suggestionCount":1}
{"label":"OVERLAND COMMUNITY CENTER","text":"9225 LACKLAND RD, 63114","refPrecinct":"MID014","esri":{"addr":"9225 Lackland Rd, Saint Louis, Missouri, 63114","type":"PointAddress","score":100,"precinct":"MID014"},"census":{"addr":"9225 LACKLAND RD, SAINT LOUIS, MO, 63114","precinct":"MID014"},"suggestFor":"9225 LACKLAND ","firstSuggestion":"9225 Lackland Rd, Saint Louis, MO, 63114, USA","suggestionCount":1}
{"label":"KOCH ELEMENTARY SCHOOL","text":"1910 EXUMA DR, 63136","refPrecinct":"NRW020","esri":{"addr":"1910 Exuma Dr, Saint Louis, Missouri, 63136","type":"PointAddress","score":100,"precinct":"NRW020"},"census":{"addr":"1910 EXUMA DR, SAINT LOUIS, MO, 63136","precinct":"NRW020"},"suggestFor":"1910 EXUMA DR","firstSuggestion":"1910 Exuma Dr, Saint Louis, MO, 63136, USA","suggestionCount":1}
{"label":"TWILLMAN ELEMENTARY SCHOOL","text":"11831 BELLEFONTAINE RD, 63138","refPrecinct":"SF014","esri":{"addr":"11831 Bellefontaine Rd, Saint Louis, Missouri, 63138","type":"PointAddress","score":100,"precinct":"SF014"},"census":{"addr":"11831 BELLEFONTAINE RD, SAINT LOUIS, MO, 63138","precinct":"SF014"},"suggestFor":"11831 BELLEFON","firstSuggestion":"11831 Bellefontaine Rd, Saint Louis, MO, 63138, USA","suggestionCount":1}
{"label":"Apartment (unit)","text":"8025 Maryland Ave Unit 5A, Clayton, MO 63105","refPrecinct":null,"esri":{"addr":"8025 Maryland Ave, Unit 5A, Saint Louis, Missouri, 63105","type":"Subaddress","score":100,"precinct":"CLA003"},"census":{"addr":"8025 MARYLAND AVE, CLAYTON, MO, 63105","precinct":"CLA003"},"suggestFor":"8025 Maryland ","firstSuggestion":"8025 Maryland Ave, Saint Louis, MO, 63105, USA","suggestionCount":1}
{"label":"Apartment (unit)","text":"7536 Forsyth Blvd Apt 2, Clayton, MO 63105","refPrecinct":null,"esri":{"addr":"7536 Forsyth Blvd, #2, Saint Louis, Missouri, 63105","type":"Subaddress","score":100,"precinct":"CLA002"},"census":{"addr":"7536 FORSYTH BLVD, CLAYTON, MO, 63105","precinct":"CLA002"},"suggestFor":"7536 Forsyth B","firstSuggestion":"7536 Forsyth Blvd, Saint Louis, MO, 63105, USA","suggestionCount":1}
```
