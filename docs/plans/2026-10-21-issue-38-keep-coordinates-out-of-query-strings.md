# Plan: Privacy: keep voter coordinates out of ArcGIS GET query strings and the HTTP cache (issue #38)

Risk tier: High. Privacy (security-adjacent) change to the request every lookup depends on
(the precinct point query), across a data module, the e2e harness, tests and the privacy
notice; the browser HTTP cache and CORS behavior cannot be fully exercised by unit tests.
Rounded up from Medium.

Domain skills: superpowers:test-driven-development: invoke. vercel-react-best-practices: not
applicable because no component or rendering code changes. chrome-devtools-mcp: not invoked;
the browser behavior is driven with Playwright's Chromium against the production build, the
same tool the e2e gate uses. No framework, payments or email skill applies.

Plan approval: the owner's standing instructions for this batch run /work-issue without a
human pause; the plan is committed before any implementation as the skill requires.

## Requests that carry an address or coordinates (audit)

| Request | Module | Before | After |
| --- | --- | --- | --- |
| Precinct at a point (`getPrecinctAtPoint`), services6.arcgis.com | `src/data/arcgis.js` | GET, point in query string, default cache | POST form body, `cache: 'no-store'`, `credentials: 'omit'`, `referrerPolicy: 'no-referrer'` |
| County boundary at a point (`isInCountyBoundary`), services6.arcgis.com | `src/data/arcgis.js` | GET, point in query string | same as above |
| Precincts at several points (`getPrecinctCodesAtPoints`), services6.arcgis.com | `src/data/arcgis.js` | POST body, default cache | POST body plus `no-store`, `omit`, `no-referrer` |
| County address points, maps.stlouisco.com and services2.arcgis.com | `src/data/countyAddress.js` | POST body, `no-store`, `omit`, `no-referrer` | unchanged (already done in #49) |
| City geocoder `findAddressCandidates`, maps6.stlouis-mo.gov | `src/data/cityAddress.js` | POST body, `no-store`, `omit`, `no-referrer` | unchanged (already done in #58) |
| Photon `/api/`, photon.komoot.io | `src/data/photon.js` | GET, typed text in query string, `no-store`, `omit`, `no-referrer` | unchanged: Photon has no POST endpoint (live: `POST /api/` answers 404 "Endpoint POST /api/ not found") |
| Precinct by code, outline, polls, early voting sites | `src/data/arcgis.js` | GET | unchanged: they carry only a precinct code or a fixed filter, and stay cacheable for #27 |
| Map tiles, tiles.openfreemap.org | MapLibre | GET, area on screen | out of scope (tile coordinates, not the point; already disclosed and `no-referrer`) |

Live checks (2026-10-21, `Origin: https://mapthevotestl.com`): the precinct layer and the
county boundary layer answer a form POST with HTTP 200, `access-control-allow-origin: *`,
and the same features as the GET (1318 Ross Ave point gives CC007 both ways). A form POST
with no custom headers is a CORS simple request, so no preflight is sent; the layer's
OPTIONS answer is 200 with `content-type` allowed anyway. `connect-src` already allows
`https://services6.arcgis.com`, so the CSP needs no change.

## Acceptance criteria

1. `getPrecinctAtPoint` and `isInCountyBoundary` send no coordinates in the request URL:
   they POST to `<layer>/query` with the same parameters as before in a form-encoded body.
2. Every request that carries coordinates (`getPrecinctAtPoint`, `isInCountyBoundary`,
   `getPrecinctCodesAtPoints`) uses `cache: 'no-store'`, `credentials: 'omit'` and
   `referrerPolicy: 'no-referrer'`.
3. Requests that carry no address or coordinates (by code, outline, polls, early voting)
   stay GET with the browser's default cache, so #27's budgets and field trimming are
   unchanged (`outFields` still `PRECINCT_FIELDS` / `POLL_FIELDS`).
4. The one retry of a transient failure, timeouts, error mapping and every #18, #49 and
   #58 behavior are unchanged; all their tests pass, and `scripts/check-geocoder.mjs` and
   `scripts/check-config.mjs` pass live.
5. The privacy notice (`privacyCopy.js`) says the coordinates go in the body of the
   request, not its web address, and that the browser does not keep these requests in its
   cache; it still says Photon gets typed text in its web address. The "never" list no
   longer points to a cache caveat that is gone.
6. README (Privacy) and docs/data.md no longer say #38 is pending; they describe the
   result, including that Photon stays GET because it has no POST endpoint.
7. In a real browser (Chromium, production build, production CSP), a lookup's point query
   is a POST whose URL holds no coordinates, and the lookup still opens the right precinct.

## Files that change

- `src/data/arcgis.js`: a `sensitive` query option (POST body, `no-store`, `omit`,
  `no-referrer`) used by the three point queries; the header comment.
- `src/data/arcgis.test.js`: point queries asserted as POST bodies with the fetch options;
  by-code and layer queries asserted to stay GET.
- `src/features/lookup/locate.test.js`: its recorded-response stub reads the point from the
  POST body instead of the URL (found while implementing; no assertion changes).
- `src/test/addressPrivacy.test.jsx`: the coordinates are found in the POST body and in no
  request URL.
- `src/features/privacy/privacyCopy.js` and `PrivacyPage.test.jsx`: the new wording.
- `e2e/fixtures.js`: `fixtureBody` reads parameters from a POST body too.
- `e2e/failures.e2e.js`: routes the point query by its POST body.
- `README.md` (Privacy), `docs/data.md`: wording.

## Order of work

1. Red: arcgis.test.js asserts POST plus fetch options for the two point queries and
   options for the multipoint query; addressPrivacy.test.jsx asserts no URL holds the point.
2. Green: arcgis.js.
3. e2e harness reads POST bodies; run e2e.
4. Privacy copy and its test; README and docs/data.md.
5. Full gate, live check scripts, browser drive.

## Risks

- The e2e harness or Lighthouse server routes by URL parameters; a POST point query would
  get the "no precinct" fixture and wrongly fail the failures suite. Mitigated in step 3.
  Lighthouse visits no lookup flow, so its server (GET only) is unaffected.
- `cache: 'no-store'` and `referrerPolicy` in Node's fetch (check-geocoder runs
  getPrecinctAtPoint in Node): countyAddress.js already passes both in Node, so it works.
- A POST could be slower than a cached GET on a repeat lookup of the same point. Repeat
  lookups are rare and the privacy gain is the point of the issue.

## Proof

- Criterion 1, 2, 3: `src/data/arcgis.test.js`.
- Criterion 1 end to end in jsdom: `src/test/addressPrivacy.test.jsx`.
- Criterion 4: the full vitest suite, `npm run test:e2e`, `npm run test:perf`, and live
  `node scripts/check-geocoder.mjs` and `node scripts/check-config.mjs`.
- Criterion 5: `PrivacyPage.test.jsx`.
- Criterion 7: a Playwright drive of the production build with the production CSP header
  injected, against the live services, recording the point query's method, URL and body.
