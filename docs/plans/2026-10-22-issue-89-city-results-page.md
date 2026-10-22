# Plan: City results page: where to vote, the City's Election Day rule and the map (issue #89)

Risk tier: High. Election-critical voter information (where a City voter may vote), stateful
UI (cards, map, retry), a changed adapter contract (the City adapter starts answering), and
about 15 files. Plan approval: the coordinator dispatched this run with "keep moving" for the
November 3 election and no owner available mid-run; approval is recorded as delegated, and any
real decision goes to the issue with `needs-decision`.

Domain skills:
- superpowers:test-driven-development: invoke.
- vercel-react-best-practices: invoke (React components, bundle size: first load has about
  2 KB left under the 120 KB budget).
- run: invoke for the live drive.
- chrome-devtools-mcp:a11y-debugging: not applicable because the Playwright axe suite
  (`e2e/a11y.e2e.js`) runs the same WCAG 2.1 AA checks at 360 and 1280 px, and a City route
  is added there.
- frontend-design: not applicable because the City card reuses the County card's layout, as
  the issue requires.
- dataviz, django, expo, fastapi: not applicable (no charts, no backend, no mobile app).

## Acceptance criteria

1. `/p/<a City code>` (like `/p/W01P12`) shows the nearest City Election Day polling places
   (only City sites), sorted by distance from the looked-up point or, on a share link, from
   the precinct's center, with "Show more", directions links and the County card's layout.
2. The polling places card for a City precinct shows the City Board's own Election Day rule,
   quoted from its polling places page, with its source link and last-verified date, all read
   from the City block of `src/config/election.js`. It never shows the County's
   assigned polling place rule, phone number or sources.
3. Each City polling place shows the City Board's published entrance details
   (`disabledentry`, `entrydetails`) in plain words when present. `accessible` is empty on
   every row, so it is not read.
4. The map shows the City precinct outline and the listed City markers, with the same
   basemap, keyboard and screen reader behavior; its data credit names the City Board.
5. The header shows the City equivalent of the municipality line: "City of St. Louis, Ward 1,
   Precinct 12". No precinct status banner for a City precinct (every City precinct is in the
   November 3 general election; the City layer has no status field).
6. Every fallback link on a City page goes to the City Board or its polling places page
   (the City's official lookup), never the County's: page errors, polling places errors and
   the cards not built yet for the City (sample ballot #92, early voting #91, districts #90).
7. No County text on a City page: no "county's" lookup links, County rule, County board
   credit or "county's precinct data" error.
8. With the City layers failing, the page shows the #18 failure states (message, Try again,
   focus) with City links.
9. Axe passes on `/p/W01P12` at 360 px and 1280 px (City route added to `e2e/a11y.e2e.js`).
10. City-only code adds as little as possible to the first load, and the first load stays
    under 120 KB gzipped; the City data client stays lazy.
11. County pages are unchanged.

## Files that change

- `src/config/election.js`: City block gains `electionDayRule` (`quote`, `sources`,
  `lastVerified`) and `siteFields.entry` / `siteFields.accessibleEntry`.
- `src/config/election.test.js`: the City site field keys, and the rule's shape.
- `src/data/cityArcgis.js` (+ test): read the two entrance fields into `entry` and
  `accessibleEntry` on each site.
- `src/data/jurisdictions.js` (+ test): the City adapter's `getPrecinct`, `getPolls` and
  `getOutline` call the lazy City client; `getEarlyVotingSites` stays "not found" until #91.
  The adapter stays data-only; the page and cards branch on `jurisdiction.id`.
- `src/data/cityPrecinctCode.js` (+ test): `cityWardPrecinct(code)` -> `{ ward, precinct }`.
- `src/features/lookup/nearbyPolls.js` (+ test): title-case only all-caps text (the County's),
  keep mixed-case City names as published ("Carr Lane VPA Middle School"); carry `entry` and
  `accessibleEntry`.
- `src/features/lookup/PrecinctPage.jsx` (+ test): City header line, no banner for City,
  City error text.
- `src/features/lookup/ResultsCards.jsx`: City cards not built yet link the City Board.
- `src/features/lookup/PollsCard.jsx` (+ test): jurisdiction's official lookup link, City
  nearest note, City rule block instead of the County rule, entrance lines.
- `src/features/lookup/CityElectionDayRule.jsx` (new, + test): the quoted rule with source and
  last-verified date.
- `src/features/lookup/PrecinctMap.jsx` (+ test): data credit per jurisdiction.
- `src/features/lookup/resultsCopy.js`, `src/i18n/en.json`: the City strings.
- `e2e/fixtures.js`, `e2e/a11y.e2e.js`, `e2e/failures.e2e.js`: answer City layers from the
  City fixtures; a City route in axe; City layers failing.
- `docs/raw/fixtures/city-polls.json`, `city-early-voting-sites.json`: re-recorded with the
  entrance fields (`node scripts/record-fixtures.mjs city-polls` and `city-early`).
- Docs (Phase 8): README (Election config, Updating for a new election), docs/data.md
  (St. Louis City: entrance fields decided, the adapter now answers).

## Order of work

1. Config + config tests.
2. `cityWardPrecinct` (TDD).
3. City client entrance fields (TDD), re-record fixtures.
4. `nearbyPolls` casing and entrance fields (TDD).
5. Adapter wiring (TDD).
6. Cards, page, map, copy (TDD in the component tests).
7. e2e fixtures and routes.
8. Gate, live drive, docs.

## Risks

- Riskiest: the adapter now answers, so every County-only assumption in the cards shows on a
  City page. Mitigation: a page test that renders `/p/W01P12` and asserts no "county" text.
- First-load budget (about 2 KB left): City strings live in en.json (first load). Keep them
  few and short; the rule's quote lives in config (already first load, but short).
- Title case change could alter a County name with lowercase letters: County fixtures are
  all caps (checked), and the rule is "case only text with no lowercase letter".
- #88 lands in parallel and touches en.json, docs/data.md, PrecinctPage-adjacent code:
  rebase and keep both sides.

Not done here, on purpose: building photos and `boxlocdesc` (comment on #89; needs CSP,
privacy notice and #57's meaning of `boxlocdesc`): a follow-up issue. An assigned polling
place per City precinct: no layer assigns one (docs/data.md), so none is shown. The County
precinct map draws no County boundary today, so there is no boundary to swap for the City's.

## Proof

- Criterion 1, 3, 11: `nearbyPolls.test.js`, `PollsCard.test.jsx` (City rows, entrance lines,
  County rows unchanged).
- Criterion 2, 7: `CityElectionDayRule.test.jsx`, `PrecinctPage.test.jsx` (City page has the
  quote, source, last verified, and no "county" text).
- Criterion 4: `PrecinctMap.test.jsx` (City credit).
- Criterion 5: `cityPrecinctCode.test.js`, `PrecinctPage.test.jsx`.
- Criterion 6, 8: `PrecinctPage.test.jsx`, `e2e/failures.e2e.js` City case.
- Criterion 9: `e2e/a11y.e2e.js` City route.
- Criterion 10: `src/test/build.test.js`.
- Live drive: `npm run build && npm run preview`, open `/p/W01P12` against the live City
  layers: 3 nearest City sites with entrances, Show more, the rule with source, the map with
  the outline and markers; then block the City host and see the failure state with City links.
