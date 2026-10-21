# Plan: Geocoding: evaluate Census and Esri, then build address search with autocomplete (issue #7)

Status: spike done; build waits on an owner decision (see Open decision).

Risk tier: High. Address text is the most sensitive data the app handles, and this code
decides where it goes (privacy label, forced High as a security control). The combobox is
stateful, async UI with request cancellation, which unit tests cannot fully exercise.

Domain skills:
- superpowers:test-driven-development: invoke.
- vercel-react-best-practices: invoke for the combobox component.
- frontend-design: not applicable because the visual layout of the landing screen is #10;
  this issue builds the input and its listbox with existing tokens.
- context7 (docs lookup): invoke if a library is added; the plan uses none.
- expo, django, django-ninja, fastapi, claude-api, dataviz: not applicable because none of
  those stacks are involved.

Mode: commit. The owner authorized commits, pushing this issue branch, the PR and its squash
merge for this run.

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

## Open decision

Which way to get a permitted geocoder:
- A (recommended): Esri with an ArcGIS Location Platform API key created by the owner,
  restricted by HTTP referrer to the production and preview origins, scoped to geocoding
  only, read at build time from `VITE_ARCGIS_API_KEY`. Suggests are free and 20K
  not-stored geocodes a month are free, then $0.50 per 1,000.
- B: Esri without a token. Works today, costs nothing, but goes against Esri's stated terms
  and could be cut off with no notice, on Election Day included.
- C: Census through a proxy. Rejected by the spike: no suggestions, and the proxy is a
  server of ours seeing addresses.

## Acceptance criteria (for the build, once decided)

1. `src/data/geocoder.js` exports `suggest(text, { signal })` and `resolve(suggestionOrText,
   { signal })`; nothing else in the app knows the provider.
2. `suggest` returns at most 5 suggestions limited to the county extent and `countryCode=USA`;
   `resolve` returns `{ lat, lng, label }` or `null`.
3. Suggestions are requested about 250 ms after typing stops, only at 3 or more characters,
   and an in-flight request is aborted when the user keeps typing.
4. The input follows the WAI-ARIA combobox pattern: `role="combobox"`, `aria-expanded`,
   `aria-controls`, `aria-activedescendant`, arrow keys, Enter, Escape; tested with Testing
   Library by keyboard only.
5. Address text is sent only to the geocoder: never to our servers, logs, analytics,
   `localStorage`, `sessionStorage`, or the URL. A test fails if `src/` writes it there.
6. The 10 test addresses in `docs/data.md` resolve to the listed precincts (live check
   script, like `scripts/check-sample-ballots.mjs`).
7. The geocoder provider is named for the privacy notice (#20).

## Files that change

Spike (this commit): `docs/data.md`, this plan.
Build: `src/data/geocoder.js`, `src/data/geocoder.test.js`, `src/features/lookup/AddressSearch.jsx`
and its test, `src/config/election.js` (county extent), `scripts/check-geocoder.mjs`.

## Proof

Spike script, run 2026-10-21 with Node 24 from the repo root:

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
