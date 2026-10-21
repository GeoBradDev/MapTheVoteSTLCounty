# Plan: Performance and mobile QA: Lighthouse 90+ at 360px (issue #27)

Risk tier: Medium. No money, auth or data-destroying code, but the change alters existing
results page behavior (when the map loads, where it sits, what the loading state shows),
which unit tests cannot fully exercise, and it touches more than a few files.

Domain skills:

- vercel-react-best-practices: invoke (React rendering and loading changes on the results page).
- chrome-devtools-mcp:debug-optimize-lcp: not applicable because Lighthouse itself, run by the
  new script, reports the LCP element and its breakdown, which is what this run uses.
- chrome-devtools-mcp:a11y-debugging: not applicable because the existing axe e2e run (#26)
  covers the changed pages and stays in the gate.
- frontend-design: not applicable because no new visual design; the map keeps its look.

## Baseline (measured before any change)

Lighthouse 13.5.0, mobile, simulated slow 4G and 4x CPU, 360 x 640 viewport, production build,
county layers from `docs/raw/fixtures/`, every other outside request blocked:

- `/`: 100. `/learn`: 100.
- `/p/CC007`: 76. LCP 3.0 to 3.2 s, CLS 0.23 to 0.39, TBT 10 to 320 ms. With a blank basemap
  style answered (so the map renders as in production) TBT is 270 to 320 ms, all of it
  MapLibre (its chunk and its setup); with WebGL 2 removed, TBT is 0.
- CLS comes from the polls card: a three-line skeleton becomes the "distances from the
  center" line, the map (about 330 px) and the list (about 400 px), pushing the hours and
  the cards below down.
- LCP is the "distances from the center" paragraph, which waits for HTML, JS, the precinct,
  then the whole polls layer (133 KB, every field) and the outline.
- First-load JS: entry chunk 96.4 KB gzipped, under the 120 KB budget. Fonts: the system
  stack already (Tailwind's default `font-sans`), nothing to download.

## Acceptance criteria

1. CI runs Lighthouse (mobile emulation, 360 px wide) on `/`, `/p/CC007` (fixture precinct)
   and `/learn`, and fails when any page's performance score is below 90.
2. The Lighthouse run never calls a live service: the county layers come from the recorded
   fixtures, the basemap style is answered with a blank local style, and every other outside
   request is blocked.
3. Budgets are enforced in CI: the first-load JS (the entry chunk) is under 120 KB gzipped,
   and LCP is under 2.5 s on simulated 4G on each of the three pages.
4. Fonts: the app downloads no web font; a test fails if the built CSS declares `@font-face`.
5. ArcGIS queries ask only for the fields the app reads: precinct queries for the precinct
   fields the app reads, the polls layer for the poll fields it reads, and the whole-layer
   GeoJSON polls queries round coordinates to 6 decimals (about 0.1 m).
6. The results page's polls card reserves the list's space while loading, so loading causes
   no large layout shift, and the map starts loading only when it scrolls into view; it sits
   after the list (and its "Show more" button), so on a 360 px phone the list comes first.
7. The results page starts the polls, absentee sites and (without a looked-up point) the
   outline requests at the same time as the precinct request, instead of after it.
8. All of `/p/CC007`, `/` and `/learn` score 90+ in the CI run.
9. Real-device checks (an older Android, an iPhone) are listed on the issue, since CI cannot
   do them; the PR uses `Refs #27`.

## Files that change

- `package.json`, `package-lock.json`: devDependencies `lighthouse`, `puppeteer-core`;
  script `test:perf`.
- `e2e/fixtures.js` (new): the fixture answering rules shared by the axe run and the
  Lighthouse run (which layer, which fixture, projecting to the requested `outFields`).
- `e2e/a11y.e2e.js`: use `e2e/fixtures.js` instead of its own copy.
- `e2e/lighthouse.js` (new): builds nothing; serves `dist/` with `vite preview`, runs
  Lighthouse through puppeteer-core on Playwright's Chromium, three runs per route, median
  score; prints scores and metrics; writes HTML reports to `lighthouse-reports/`; exits 1
  below 90, with LCP at or over 2.5 s, or when a run ended without the page's content.
- `.github/workflows/ci.yml`: run `npm run test:perf` after the e2e step; upload the reports as
  an artifact.
- `.gitignore`, `.prettierignore`, `eslint.config.js`: ignore `lighthouse-reports/`.
- `src/data/arcgis.js`: `PRECINCT_FIELDS`, `POLL_FIELDS`; narrowed `outFields`;
  `geometryPrecision` on whole-layer queries.
- `src/data/arcgis.test.js`: tests for the narrowed queries.
- `src/test/checkConfig.test.js` (or a new test): the fields `scripts/check-config.mjs`
  checks equal the fields the app asks for, so the two lists cannot drift.
- `src/features/lookup/PrecinctPage.jsx`: start the card requests with the precinct request.
- `src/features/lookup/PollsCard.jsx`: a skeleton shaped like the list; the "distances from
  the center" line shown while loading too; the map after the list.
- `src/features/lookup/PrecinctMap.jsx`: wait until the region is in view (IntersectionObserver;
  without one, load at once) before importing MapLibre and starting the 15 s clock.
- Tests: `PollsCard.test.jsx`, `PrecinctMap.test.jsx`, `PrecinctPage.test.jsx`,
  `src/test/build.test.js` (JS budget, no `@font-face`).
- Docs: `README.md` (Performance section, Map section), `docs/data.md` if it describes the
  queries' fields.

## Order of work

1. Shared fixtures module; refactor the axe run onto it (behavior unchanged).
2. Lighthouse script and npm script; confirm it reproduces the baseline.
3. Build test budgets (JS, no web fonts).
4. ArcGIS fields and precision, with tests; check-config consistency test.
5. Parallel requests on the results page, with a test.
6. Polls card skeleton and line; map after the list and loaded in view, with tests.
7. Measure; CI step and artifact; docs.

## Risks

- Narrowing `outFields` drops a field some code reads: every reader was grepped (precinct:
  `precinct`, `in_election`, `html`, `municipality`, the district fields; polls: `loc`, `name`,
  `address`, `zipcode`, `abs_type`, `notes_abs`), and the e2e fixture projection makes the
  browser runs see only the requested fields, so a missed field shows up there.
- Lighthouse scores vary between runs and runners: three runs per route, the median is
  compared, and the results page target is met with margin, not at 90 exactly.
- Moving the map after the list and loading it on view changes #13's layout; the map is
  "extra help" (README), the list holds everything on it. Noted in the PR as a call made.
- Prefetching the polls layer for a code that turns out not to exist wastes one request;
  `checkCode` stops malformed codes first.
- The map in CI uses software WebGL; the blank style keeps tile and glyph traffic off the
  network. The map loads only on scroll, so the Lighthouse run (which does not scroll) does
  not measure MapLibre at all; that is the behavior real phones get too.

## Proof

- Criterion 1, 2, 3 (LCP), 8: `npm run test:perf` output, locally and in the CI log.
- Criterion 3 (JS), 4: `src/test/build.test.js`.
- Criterion 5: `src/data/arcgis.test.js`, the check-config consistency test.
- Criterion 6: `PollsCard.test.jsx`, `PrecinctMap.test.jsx`; Lighthouse CLS on `/p/CC007`; the
  axe e2e run still green.
- Criterion 7: `PrecinctPage.test.jsx` (requests start before the precinct answers).
- Live drive: results page in Chromium at 360 px against the fixtures: list first, map after
  it, map loads after scrolling to it.

## Revisions during implementation

- The Lighthouse run first answered the fixtures by request interception inside the browser.
  Intercepted responses cannot be gzipped (Chromium does not decode them, and a gzipped try
  left the results page on its error message while still scoring 98), and Lighthouse's model
  charges them a full connection setup. The run now maps the ArcGIS and basemap hosts to a
  local HTTPS server (`--host-resolver-rules`, a throwaway `openssl` certificate) that answers
  from the same fixtures, gzipped like the county's service, and maps every other host to
  nothing. Each run also checks, in the page, that it showed the route's content, so an error
  state can never pass.
- `src/test/build.test.js` now builds with `NODE_ENV=production`: under Vitest it built React's
  development bundle, which the JS budget would have measured (159 KB instead of 95 KB).
- A `preconnect` to the ArcGIS host was tried and dropped: no measurable change in the
  Lighthouse run.
- `README.md` gets a Performance section, including the by-hand phone checks.
- Results with the final harness: main scores 100, 82 (LCP 2.4 s, TBT 226 ms, CLS 0.23) and
  100; this branch 100, 98 (LCP 2.3 s, TBT 0, CLS 0) and 100.
