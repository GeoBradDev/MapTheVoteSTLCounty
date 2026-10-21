# Plan: City voter can get a county precinct when the City address is missing from Photon (issue #58)

Risk tier: High. A defect here sends a St. Louis City voter to a St. Louis County precinct
(wrong precinct), the change adds a new third party that receives the typed address (privacy
and the enforced Content-Security-Policy), it alters existing lookup behavior on every county
match, and it adds an async network step with a timeout. The owner's decision comment on the
issue (2026-10-21, option 1) stands in for plan approval; the run is unattended.

Domain skills:
- superpowers:test-driven-development: invoke.
- chrome-devtools-mcp (chrome-devtools): invoke for the live drive under the production CSP.
- vercel-react-best-practices, frontend-design: not applicable because no React component or
  layout changes; only copy in `privacyCopy.js`.
- context7: not applicable because the code uses plain `fetch` and the ArcGIS REST
  `findAddressCandidates` operation, probed live.
- expo, django, django-ninja, fastapi, claude-api, dataviz: not applicable because none of
  those stacks are involved.

## Acceptance criteria

1. `6135 Washington Ave, St. Louis, MO` and `6135 Washington Ave` never resolve to a county
   precinct (they resolved to FER022): the City's official geocoder has 6135 WASHINGTON AVE
   63112 as a PointAddress, so the lookup returns a City place and the City referral (#8).
2. `6135 Horton Pl, St. Louis, MO 63133` never resolves to UNV202: 63133 crosses the City
   line, so the City check runs although a ZIP was typed; the City has 6135 HORTON PL 63133,
   so the answer is the City referral.
3. The City check is the City of St. Louis's geocoder
   (`https://maps6.stlouis-mo.gov/arcgis/rest/services/GEOCODERS/COMPOSITE_GEOCODE/GeocodeServer`),
   not Photon. It runs on every non-City result of the chain (a county match, or a Photon
   answer outside the City) unless the text holds a ZIP that is entirely outside the City
   (a fixed list of county-only ZIPs). A typed town no longer skips the check. For a picked
   suggestion, the ZIP in its label is the county record's, not the voter's, so the check
   ignores it (revision after review finding 1: picking the county's `6135 Washington Ave
   ... 63134` suggestion still gave FER022). Searching again while the box still holds the
   picked label sends the pick again (revision after review finding 2: the label resent as
   text skipped the check and gave FER022), and so does an edit of the label that keeps its
   ZIP, like a unit added (revision after review finding 3). Editing the label and restoring
   it exactly still sends typed text: the frozen test `AddressSearch.repick58.test.jsx`
   asserts that, and rewriting it needs the owner's approval. Once the label's ZIP leaves the
   box, the pick is forgotten, so a ZIP typed later is the voter's own (revision after review
   finding 4: a county voter retyping their address with a county-only ZIP got the City
   referral; frozen `AddressSearch.retype58.test.jsx`).
4. A City match counts when a City `PointAddress` has the typed house number and the typed
   whole street under the strict rules (`matchesStreet` in `addressMatch.js`), and its ZIP
   equals the typed ZIP when one is typed (a candidate with no ZIP counts). Then the answer is
   that City place (`county: 'St. Louis city'`), which `locate()` turns into the City referral.
5. A City `PointAddress` the text could mean but not by the strict rules (the City street has
   a direction the text left out) is no match (null), as the county source does for the same
   case.
6. The City geocoder unavailable (network error, non-2xx, error body, malformed body) or slower
   than its timeout: no match (null), never the county place. An abort rejects with AbortError.
7. The address goes to the City geocoder in a POST body (no URL), with no cookies, no referrer
   and `cache: 'no-store'`, and only the house number and street (no town, ZIP or unit).
   Errors never carry the address.
8. `render.yaml` `connect-src` adds `https://maps6.stlouis-mo.gov`; the privacy notice names
   the host and says when it gets the address; Photon is no longer used as the City check and
   the notice stops saying it is.
9. Only geocoder modules name the City geocoder (the #49 provider test covers the new module
   and its host).
10. `scripts/check-geocoder.mjs` adds the two #58 cases (want the City referral) and still
    passes: 0 wrong for the polling places and 1318 Ross Ave, City Hall still referred.
    Results recorded in `docs/data.md`.
11. County addresses are unaffected: the 10 polling places and 1318 Ross Ave resolve as before.

## Files that change

- `src/data/cityAddress.js` (new): `CITY_GEOCODER_URL`, `TIMEOUT_MS` (4 s),
  `COUNTY_ONLY_ZIPS` (ZIPs entirely outside the City), `needsCityCheck(text)`, and
  `createCityAddressCheck({ url, fetch, timeoutMs })` with
  `find(text, street, { signal })` returning `{ status: 'city', place }`, `{ status: 'none' }`
  or `{ status: 'ambiguous' }`, throwing `GeocoderUnavailableError` when unavailable.
- `src/data/geocoder.js`: `createGeocoder({ sources, fallback, cityCheck })`; replaces the
  Photon cross-check (`alsoInCity`, `CROSS_CHECK_MS`) with the City check on county matches
  and on Photon answers outside the City; default export wires the City check.
- `src/data/photon.js`: comment on `findPlaces` (no longer used by the chain; kept).
- `src/data/geocoderChain.test.js`: the cross-check tests rewritten for the City check.
- `src/data/cityAddress.test.js` (new): request shape, matching, ZIP rules, failures, and the
  #58 cases against recorded fixtures `docs/raw/fixtures/city-geocode-*.json`.
- `src/data/geocoder.test.js`: provider test also covers `stlouis-mo.gov` and the new module.
- `render.yaml`, `src/test/render.test.js` (if it pins the policy), `scripts/smoke.mjs` (if
  it pins the policy).
- `src/features/privacy/privacyCopy.js`, `PrivacyPage.test.jsx`.
- `src/features/lookup/GeocoderAttribution.jsx`, `lookupCopy.js` and its test: the line under
  the address box says the address is "sent only to these services", so it must name the City
  check too (added during implementation, found in the live drive).
- `scripts/record-fixtures.mjs`: records the City geocoder fixtures.
- `src/features/lookup/AddressSearch.jsx` and the frozen `AddressSearch.repick58.test.jsx`:
  a search with a pick's label unchanged in the box resends the pick; frozen
  `AddressSearch.editpick58.test.jsx`: an edit that keeps the label's ZIP goes as a pick.
- `scripts/check-geocoder.mjs`: the City check in the app chains; the #58 cases.
- `docs/data.md`, `README.md`, `docs/progress.md`.

## Order of work

1. Plan commit.
2. Red test: the chain with a county match for `6135 Washington Ave` and the City module
   answering from the recorded fixture returns a City place, not the county place. Commit red,
   freeze.
3. `cityAddress.js` and its unit tests; wire into `geocoder.js`; rewrite cross-check tests.
4. CSP, privacy copy and tests; provider test.
5. check-geocoder script, run live; docs.
6. Gate, live drive in Chrome under the production CSP (preview build with the CSP header).

## Risks

- City geocoder outage turns every county lookup without a county-only ZIP into no match. The
  owner accepted this ("error or timeout must never yield a county precinct").
- A county voter whose address also exists in the City (same number and street) and who types
  no ZIP, or a ZIP that crosses the City line, gets the City referral. Typing a county-only ZIP
  resolves it. Owner rule: an exact City match never yields a county precinct.
- `COUNTY_ONLY_ZIPS` is derived from Census 2020 ZCTAs (county ZCTAs that do not come within
  500 m of the City); a ZCTA is not a USPS ZIP. The ZIP-consistency rule in criterion 4 means
  the list only saves a request: a City candidate can only count when its ZIP equals the typed
  one, so a wrong list entry can skip a check only for a City address whose ZIP is on the list.
- Interpolated `StreetAddress` candidates are ignored (they say a street range exists, not a
  house), so a City house missing from the parcel geocoder is not seen.
- Not done: broader St. Louis City lookup support (#57, parked).

## Proof

- Criterion 1, 4: `geocoderChain.test.js` red test with the recorded Washington Ave fixture;
  `cityAddress.test.js` matching cases.
- Criterion 2: `cityAddress.test.js` / chain test with the Horton Pl fixture and ZIP 63133.
- Criterion 3: chain tests for the skip list, the Photon path and the typed-town case;
  `geocoder.pick58.test.js` (frozen) for a picked county suggestion.
- Criterion 5, 6: unit tests for direction-less twin, HTTP error, error body, timeout, abort.
- Criterion 7: unit test on the request (method, body, credentials, referrer, cache).
- Criterion 8, 9: `PrivacyPage.test.jsx`, `render.test.js`, `geocoder.test.js`.
- Criterion 10, 11: `node scripts/check-geocoder.mjs` output; live drive in Chrome on the
  production build with the CSP: the two #58 cases show the City notice, City Hall shows it,
  1318 Ross Ave opens /p/CC007, no CSP violations in the console.
