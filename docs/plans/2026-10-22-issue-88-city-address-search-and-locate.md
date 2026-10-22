# Plan: City address search and Use my location open a City precinct instead of the referral (issue #88)

Risk tier: High. Election-critical precinct routing for every City voter, and it alters
existing #58 rules, the out-of-area copy and the privacy notice across several files.
Run autonomously for the coordinator: no human plan gate was available, so the plan is
committed without one and the PR says so.

Domain skills: superpowers:test-driven-development (invoke); vercel-react-best-practices
(invoke, small React change in AddressLookup and OutOfCountyNotice); frontend-design (not
applicable because no new visual design, only copy and a second link); chrome-devtools a11y
(not applicable because no new interactive control; the e2e axe suite covers the notice);
dataviz, django, fastapi, expo (not applicable because no charts, no backend, no mobile).

## Acceptance criteria

1. An exact City match (a City `PointAddress`) opens `/p/<City code>` (like `/p/W01P12`),
   typed or picked, for City Hall (1200 Market St 63103) and 6135 Washington Ave 63112,
   which Photon lacks.
2. The City geocoder is asked for a City address ahead of Photon when the county answers no
   match, unless the text holds a ZIP entirely outside the City. Only `PointAddress`
   candidates count, and the typed ZIP and town must agree (the strict rules).
3. Suggestions show City addresses next to county ones. A City suggestion's label names
   "St. Louis City" and its ZIP, so twins read apart (6135 Washington Ave, St. Louis City,
   MO 63112 vs the county's 63134 record).
4. #58 rules with the City as a destination: a county match whose number and street the
   City has in another ZIP opens the City precinct; the county and the City listing the
   same number, street and ZIP (1 Brookings Dr 63130, 6135 Horton Pl 63133) is still no
   match; the City geocoder unavailable never gives a City address a county precinct, and a
   county address with a county-only ZIP is unaffected.
5. `locate()` returns `{ kind: 'precinct', jurisdiction: 'city', precinct }` for a point in
   a City precinct: asked first when the geocoder names the City, and after the county
   precinct layer finds nothing when the point is within the City's extent (so a point far
   from the City never goes to the City's layer). County precincts return
   `jurisdiction: 'county'`.
6. `stl-city` stays only as the fallback when the City precinct layer finds nothing or
   fails for a place the geocoder names as the City and the county layer has no precinct
   there (the point decides, as today), or fails for coordinates alone near the City outside
   the county; its notice links the City Board and the City's own polling place lookup.
7. A point in neither precinct layer keeps today's Missouri and out-of-state answers.
8. Use my location (coordinates only) in the City opens the City precinct, under the #83
   accuracy rule (unchanged).
9. Out-of-area copy: "outside St. Louis County" becomes "outside St. Louis City and County",
   and the Missouri and unknown messages no longer send City voters to the Secretary of State.
10. Privacy: the typed address goes only to hosts the notice names, in a POST body for the
    City, never into a URL or storage; the notice says what the City geocoder and the City's
    election maps now get.
11. `node scripts/check-geocoder.mjs` passes and checks City addresses (City Hall, the #58
    addresses, addresses near the City line, and 5010 Nottingham Ave 63109, an owner report
    added mid-run) for a City precinct, typed and picked.
12. First-load JS stays under the 120 KB budget: the City data client stays lazy.

## Files that change

- `src/data/cityAddress.js`: add `lookup(text)` (first-class City source, strict
  `matchesTyped`, PointAddress only, distinct labels) and `suggest(text)` (PointAddress
  candidates whose number and street start with the typed words). City labels say
  "St. Louis City".
- `src/data/geocoder.js`: after a county no match (county answered), ask `cityCheck.lookup`
  before Photon; merge `cityCheck.suggest` with county suggestions; a City failure that
  leaves no answer reports unavailable with `reportUnavailable`.
- `src/features/lookup/locate.js`: City precinct layer through `loadCityClient()`, the City
  extent constant, `jurisdiction` on precinct results.
- `src/features/lookup/AddressLookup.jsx`: navigate to the code for either jurisdiction.
- `src/features/lookup/outOfCountyCopy.js`, `OutOfCountyNotice.jsx`, `src/i18n/en.json`:
  copy and the City lookup link.
- `src/features/privacy/privacyCopy.js`, `src/i18n/en.json`: notice text, the City election
  maps host.
- `src/features/lookup/GeocoderAttribution.jsx` copy: the City is a source, not only a check.
- `scripts/check-geocoder.mjs`: City expectations become a City precinct; more City cases.
- Tests: new `cityAddress.lookup88.test.js`, `geocoderChain.test.js` / `geocoder.city58.test.js` /
  `geocoder.sharedzip58.test.js` / `geocoder.pick58.test.js` where expectations change,
  a new `geocoder.city88.test.js`, `locate.test.js`, `AddressLookup.test.jsx`,
  `OutOfCountyNotice.test.jsx`, privacy tests as needed.
- Docs: README (Address search, Privacy, Election config), `docs/data.md` (Geocoding, City
  check), `docs/progress.md` (the #87 line the coordinator gave).

## Order of work

1. cityAddress `lookup` and `suggest`, with fixture tests (red, then green).
2. geocoder chain: City ahead of Photon, merged suggestions; tests for each #58 case.
3. locate: City precinct, extent, fallback; tests with the City fixtures.
4. AddressLookup navigation to a City code; tests.
5. Copy: out-of-area, attribution, privacy notice; tests.
6. check-geocoder script; run it live.
7. Docs.

## Risks

- A county address opening a City precinct: guarded by asking the City as a source only
  after the county answered no match (never when the county is down), the strict town and
  ZIP rules, and the existing same-ZIP rule for county matches.
- Out-of-state text that names a street the City also has (1600 Pennsylvania Ave, DC): the
  strict rules reject a typed town other than St. Louis and a typed ZIP the parcel lacks.
- Photon placing a City-labeled answer: it now opens a City precinct from the point, as
  Photon answers already do for the county; never a county precinct.
- The City results page is a stub until #89: a City voter reaches a "not found" page that
  links the City's own lookup. Accepted by the coordinator for this batch.
- Bundle: the new geocoder code is in the first load (about 2.1 KB room); the City
  precinct client stays behind `loadCityClient()`.
- The City getting typed text as suggestions are typed: only text that starts with a house
  number and a full word, debounced like today, in a POST body; the notice says so.

Not doing: the City results page (#89), the City's official lookup link in the lookup's
error line (#93), the Clayton municipality no match (opened as #143, unrelated).

## Proof

- Criteria 1, 2, 4: `src/data/geocoder.city88.test.js` and `src/data/cityAddress.lookup88.test.js`
  (new, from the recorded City geocoder fixtures, including 5010 Nottingham Ave and the partly
  typed `6135 Washington` and `5010 Nottingham`); `scripts/check-geocoder.mjs` live.
- Criterion 3: geocoder suggest and pick tests (`geocoder.city88.test.js`), and picks of
  county and City suggestions through the live chain in `scripts/check-geocoder.mjs`.
- Criteria 5 to 8: `locate.test.js` with `city-precinct-at-point.json` and failures;
  `AddressLookup.test.jsx` navigation to `/p/W01P12`.
- Criterion 9: `OutOfCountyNotice.test.jsx`.
- Criterion 10: `cityAddress.lookup88.test.js` (POST body, the street only, no address in
  the URL), `locate.test.js` (the City point query reads the point from the POST body),
  `PrivacyPage` tests, and the unchanged `addressPrivacy.test.jsx` and `no-storage.test.js`.
- Criterion 12: `src/test/build.test.js`.
- Live drive: build and preview; type City Hall, 6135 Washington Ave 63112, 1 Brookings Dr
  63130, a county address, a St. Charles address and an out-of-state address; pick a City
  suggestion; Use my location emulated at City Hall. Expect `/p/W..P..` for City places,
  `/p/<county code>` for the county one, no match for Brookings, Missouri and out-of-state
  notices, and in the Network panel, City requests as POSTs only.

## Revisions

- Mid-run (coordinator, owner report): 5010 Nottingham Ave, St. Louis, MO 63109 added to the
  fixtures, the tests and `scripts/check-geocoder.mjs`. The City geocoder matches whole words
  only and has no suggest operation, so the City suggestion appears once `5010 Nottingham`
  is typed, not for `5010 Notting`.
- `locate()` also returns `stl-city` for a point near the City, outside the county, when the
  City layer fails (coordinates only, Use my location), so a City voter is never told the
  location is outside both.
- Review round 1: the City is asked for the house number and street only (`cityStreetOf`),
  since it finds nothing with a town after the street; `locate()` asks the City layer only for
  coordinates alone or a place the geocoder puts in St. Louis County, and falls back to
  `stl-city` on a City failure only for coordinates alone; no City suggestions while no county
  source answers.
