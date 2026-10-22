# Plan: City data client: precincts, districts, voting locations and early voting sites (issue #87)

Risk tier: Medium. A new data client against live City layers (integration a unit test
cannot fully exercise), a changed config shape, more than a few files. Nothing in the
forced-High list, and no voter-visible change: the City results page stays the #86 stub
until #89. The coordinator's brief (it carries the owner's decisions on #86, #103 and the
City wait source) stands as the plan approval.

Domain skills: superpowers:test-driven-development: invoke. vercel-react-best-practices:
not applicable because no React code changes (the lazy import is plain module code).
frontend-design, chrome-devtools-mcp:a11y-debugging: not applicable because no markup or
style changes. dataviz, django and the rest: not applicable because no charts or backend.

## Layer questions settled here for #57 (live queries, 2026-10-22)

- **Election Day list:** `VotingLocations_currentwait_4533ffc5e0c84851a35cc97e64bb160a`
  layer 0, `publicview = 'Yes'` minus the Board office (`facilityid <>
  'St._Louis_City_Election_Board'`): 56 sites, the same 56 by name and address as the City
  Board page's "Total 56 polling places" list. ElectionGeography layer 0 is a view of the
  same rows (`publicview = 'Yes'`, 57) without the ZIP fields. The Board office is the 57th
  row: an early voting site, not on the page's Election Day list. Owner decision
  (2026-10-22): leave it off the Election Day list.
- **Early voting sites:** the same layer, `publicview = 'Yes' AND earlyvoting = 'Yes'`: 8
  sites, the page's 8 No Excuse Absentee sites (the owner's wait time filter).
- **City boundary:** ElectionGeography layer 2, `districtid = 'City of St. Louis'`: the
  citywide offices' polygons, whose area equals the 207 precincts' total. The City has no
  separate boundary layer on either official server.
- **Districts for a precinct with no point:** `BOE/PRECINCTS_2023` still fails every
  query. Every precinct lies inside one district per office (checked on all 207), so the
  districts at a point inside the precinct are the precinct's districts. A polygon
  intersect returns touching neighbors, and the centroid falls outside 2 precincts, so the
  client takes a point inside the shared outline (widest scanline segment).

## Acceptance criteria

1. The City block in `src/config/election.js` names the precincts, districts, voting
   locations and boundary layers, their fields and filters, with sources; nothing about
   them is written outside the config (the hardcoding test collects the City block's
   filters too).
2. `src/data/cityArcgis.js` exports `CITY_PRECINCT_FIELDS`, `CITY_POLL_FIELDS`,
   `CITY_DISTRICT_FIELDS` (only fields the app reads; the districts list never names a
   `repname*`, `repimageurl*`, `party*`, `phone*`, `email*`, `facebook*`, `twitter*`,
   `fulladdr*` or `districturl*` field), `getCityPrecinctAtPoint(point)` (POST),
   `getCityPrecinctById(code)`, `getCityPrecinctGeometry(code)` (shared like the county
   outline), `getCityDistrictsAtPoint(point)` (POST), `getCityDistrictsForPrecinct(code)`,
   `getCityPolls()`, `getCityEarlyVotingSites()` (shared per page load with the #84
   freshness rule) and `isInCityBoundary(point)` (POST).
3. Voting locations are normalized to the cards' shape: `loc` (the site's id), `name`,
   `address`, `zipcode`.
4. The same rules as the county client: plain fetch, one retry on a transient failure, the
   same `TimeoutError` / `ServiceError` / `NotFound`, coordinates only in a POST body.
5. `W 1 P 12` and `W01P12` convert in one module, both ways, with tests.
6. Unit tests for each function: success, empty, ArcGIS error body, HTTP error, timeout and
   retry, malformed body. A test fails if a coordinate query is a GET or puts coordinates
   in the URL. A test fails if a districts query asks for any officeholder, party or
   contact field.
7. `scripts/check-config.mjs` checks every City layer and field exists, the City precinct
   count and code shape, the voting location and early voting filters, and a known City
   point; `src/test/checkConfig.test.js` fails if it does not.
8. Fixtures in `docs/raw/fixtures/` recorded with `scripts/record-fixtures.mjs`, using the
   app's field lists (never `*` on City layers that hold contact fields).
9. `src/data/jurisdictions.js` exports `loadCityClient()`, a lazy import of the City
   client, so it stays out of the first load. The City adapter's four functions stay "not
   found" with no request until #89: the results cards still carry County text and rules,
   and the page prefetches the polls and outline before the precinct answers, so wiring
   them now would fetch City layers for a page that shows none of them
   (`PrecinctPage.test.jsx` guards this). Revised during implementation: the plan first
   wired the polls, early voting sites and outline.
10. `docs/data.md` "St. Louis City" section records every layer, field, filter and the
    evidence above, so #57's layer questions for this client can close by pointing at it.
    Revised in the docs review: two #57 questions outside this client stay open and the
    section names them (what the Assigned Polling Place Lookup calls, and whether the U.S.
    House "First District" polygon follows the 2025 map, for #90).
11. `docs/progress.md` gets the coordinator's #86 line under Batch 4.

## Files that change

- `src/config/election.js`: City block layers, fields, filters, sources.
- `src/data/cityPrecinctCode.js` (new): the code shape and both conversions; re-exported
  from `jurisdictions.js`.
- `src/data/arcgis.js`: export the shared query, point parameters and shared-layer helpers
  so the City client reuses them (no County behavior change).
- `src/data/cityArcgis.js` (new) and `src/data/cityArcgis.test.js` (new).
- `src/data/interiorPoint.js` (new, with a test): a point inside a GeoJSON polygon.
- `src/data/jurisdictions.js` and its test: the City adapter.
- `src/test/election-hardcoding.test.js`: collect City `*Where` filters and the City layer
  field names (except common words like `name`; added after review).
- `src/test/build.test.js`: the City client stays out of the first load (added after review).
- `src/features/lookup/PrecinctPage.test.jsx`: a comment naming #89 as the stub's end.
- `src/config/election.test.js`: City block shape.
- `scripts/check-config.mjs`, `src/test/checkConfig.test.js`: City checks.
- `scripts/record-fixtures.mjs` (City fixtures, and a file name prefix argument so the City
  ones can be re-recorded alone), `docs/raw/fixtures/city-*.json`.
- `docs/data.md`, `docs/progress.md`, `README.md` (Election config paragraph, a St. Louis City
  data sources line, the fixture re-record step and the Data health check paragraph).

## Order of work

1. Config and the code module, with tests.
2. arcgis.js exports; interiorPoint with tests.
3. Record fixtures; cityArcgis.js test first, then the client.
4. Adapter wiring and its test; build size check.
5. check-config City checks with tests; run it live.
6. Docs.

## Risks

- The Board office filter is by `facilityid`; a republish that renames it would put the
  Board back on the Election Day list. The health check warns when the list count moves
  away from the page's count.
- 7 of the 56 have no `pollingPlaceZipCode`; the cards show no ZIP for them.
- First-load budget: the City client must be its own chunk. `src/test/build.test.js`
  guards it.

## Proof

- Criteria 2 to 6: `src/data/cityArcgis.test.js`, `src/data/cityPrecinctCode.test.js`,
  `src/data/interiorPoint.test.js`.
- 1: `src/test/election-hardcoding.test.js`, `src/config/election.test.js`.
- 7: `src/test/checkConfig.test.js` and a live `node scripts/check-config.mjs` run.
- 9: `src/data/jurisdictions.test.js`, `src/test/build.test.js` after `npm run build`.
- Live drive: a Node script calling every exported function against the live City
  layers (City Hall point, `W01P12`, `W14P08`), and the built app's `/p/W01P12` still
  showing the stub's "not found" with the City lookup link.
