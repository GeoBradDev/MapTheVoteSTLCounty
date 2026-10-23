# Plan: Performance and mobile QA, results page LCP margin (issue #27, #156)

Risk tier: Medium. A loading state on the results page changes (stateful UI that Lighthouse,
not a unit test, measures), and an existing test's assertions about the skeleton change; no
API, data or schema change.

Domain skills: superpowers:test-driven-development, invoke. chrome-devtools-mcp:debug-optimize-lcp,
invoke (the LCP element and its subparts come from the Lighthouse report). vercel-react-best-practices,
invoke (React component change). chrome-devtools-mcp:chrome-devtools, not applicable because the
Lighthouse run and Playwright drive the pages headless. frontend-design, not applicable because
the change reuses the summary's existing look.

## Audit of #27's tasks against main (e346ae2)

- Lighthouse CI on landing, results and a learn page with mobile emulation: done in #63
  (`e2e/lighthouse.js`, `npm run test:perf` in CI), extended to /p/W01P12 (#95) and
  /early-voting (#104, #151).
- Budgets: first-load JS under 120 KB gzipped (`src/test/build.test.js`, #63), MapLibre lazy
  (#13, #46), LCP under 2.5 s on simulated 4G (#63). Gap: /p/CC007 and /p/W01P12 sit about
  85 ms under the LCP budget (#156). This plan fixes that gap.
- Fonts: the system font stack (Tailwind's default `font-sans`); no `@font-face` and no font
  host in `index.html` or `src/index.css`. Nothing to do. The map's label glyphs come with
  the OpenFreeMap basemap, loaded with the lazy map only.
- Fields and geometry: every ArcGIS query names its `outFields`, precinct outlines use
  `maxAllowableOffset`, points use `geometryPrecision` (`src/data/arcgis.js`, #63 and later).
- Real-device checks: need physical devices; compiled into one owner checklist comment on
  #27. The PR uses "Refs #27".

## Cause

Lighthouse's LCP element on /p/CC007 is the summary's Election Day line, "Tuesday,
November 3, 6 a.m. to 7 p.m." (`ResultsSummary.jsx`, `ElectionDay`). It needs no data (the
date and hours come from `src/config/election.js`), but it renders only after the precinct
request answers, so the simulated new connection to the ArcGIS host counts toward LCP
(about 2418 ms against FCP 1503 ms). Same pattern as #151.

## Acceptance criteria

1. While a precinct loads, the results skeleton shows the summary's Election Day part for
   real: its "Election Day" heading and the date and hours line, with the same classes as
   the loaded summary, inside a box styled as the loaded summary's box. The rest of the
   skeleton stays placeholders hidden from screen readers, and nothing in it takes focus
   (the hours note and its source link come with the loaded summary).
2. The loaded summary renders the same Election Day text with the same classes (one shared
   component, so they cannot drift).
3. `npm run test:perf`: /p/CC007 and /p/W01P12 median LCP under about 2200 ms; every route
   still passes its budgets; CLS not worse than main.
4. First-load JS stays under the 120 KB budget (`src/test/build.test.js`).
5. No budget is loosened; the full gate is green.
6. The date line does not move when the results replace the skeleton (County and City, at
   360 px and 1280 px, for an In Election precinct): the header holds the share row's place
   and, on a phone, two lines for the precinct line while loading.

## Files that change

- `src/features/lookup/ResultsSummary.jsx`: export `ElectionDayPart` (the Part with the
  heading and the date and hours line, then children), `PlaceSkeleton` and `SUMMARY_BOX` (the
  summary box's classes); `ElectionDay` uses `ElectionDayPart` and passes the hours note and
  the nearest polling place as its children.
- `src/features/lookup/ResultsCards.jsx`: `ResultsSkeleton`'s summary box renders
  `ElectionDayPart` with a `PlaceSkeleton`, then the remaining placeholder bars
  (`aria-hidden`), with the loaded summary's box classes.
- `e2e/lighthouse.js` (revision, see below): the local fixture server waits 600 ms before it
  answers any request.
- `src/features/lookup/ShareLink.jsx` (review revision): `ShareLinkPlaceholder`, the share
  row laid out with the same classes: the button's place invisible and hidden from screen
  readers, the share note shown (revision after CI).
- `src/features/lookup/PrecinctPage.jsx` (review revision): until the precinct loads, the
  header renders `ShareLinkPlaceholder` in the one slot `ShareLink` replaces (holding the
  share row's place while a code-shaped precinct loads), so "Search another address" keeps
  focus through a "not found" answer; while loading it holds two lines for the precinct line
  below 400 px for a County precinct and below 448 px for a City one, in place of the old
  placeholder line.
- `README.md` (Phase 8): the Performance section says the fixture server waits 600 ms and
  adds the rule to show text that needs no data while the data loads.
- `e2e/a11y.e2e.js` (review revision): the date line stays put on load, County and City.
- `src/features/lookup/PrecinctPage.test.jsx`: the loading test asserts the Election Day
  heading and line show while loading, and the placeholders stay hidden.

## Revision: the Lighthouse run's fixture server

With the skeleton change alone, `npm run test:perf` still measured /p/CC007 at 2420 ms. In
a real browser (Playwright, 360 px, layers answered after 800 ms) the only LCP entry is the
skeleton's date line, at about 64 ms. In the Lighthouse run the local fixture server answered
in about 2 ms, before Chromium painted the first frame (requests at 68 ms, answers at 71 ms,
first paint at 75 ms), so the skeleton never painted, the loaded summary's line was the
observed LCP, and the simulation counted the ArcGIS connections toward it. No real ArcGIS
host answers within a frame, so the fixture server now waits 600 ms before answering.
Lighthouse's simulation counts that wait as server time, so it makes data driven content
slower, never faster. Control: main's code with this harness change measures /p/CC007 at
3020 ms and /p/W01P12 at 3014 ms (2520 and 2513 ms with the first, 100 ms wait), both
failing the unchanged 2500 ms budget, so the harness does not hide the old cause.

## Revision after the first review

The first finder found that the now visible date line moved 32 px down at 360 px (8 px up at
1024 px) when the results arrived, and that the hours note's source link in the skeleton
could be focused and then lost with it on a "not found" answer. Fixed as criterion 1 and 6
now say. The second finder found that the first version of that fix moved "Search another
address" between two slots, so a keyboard user focused on it lost focus on a "not found"
answer; it now stays in one slot (`PrecinctPage.test.jsx`, "keeps focus on Search another
address").

## Revision after CI

CI's first run measured /p/CC007 at 2541 ms and /p/W01P12 at 2522 ms. The review rerun's
finder read CI's report: the first frame painted before the answers (111 ms against about
210 ms), but CI's font (Liberation Sans or Arial metrics) fits the date line on one line
(288 x 17), so the share note under the heading (303 x 30), which the header showed only
once the precinct loaded, was the largest text and painted with the data. With the local
fonts (Noto Sans, DejaVu Sans) the date line wraps to two lines and wins. Fixes:

- `ShareLinkPlaceholder` shows the share note while loading (it needs only the code), so it
  paints with the first frame and the loaded note repaints it at the same size. A Playwright
  probe with each of Liberation Sans, Arial, DejaVu Sans and Noto Sans forced on the page
  now records one LCP entry, at the first paint, for both test precincts.
- `e2e/a11y.e2e.js` "paints its largest text before the data answers": at 360 x 640, every
  LCP entry comes before the layers answer, on whatever font the runner has. A taller or
  wider screen shows more of the loaded summary (during early voting, its "See wait times"
  link; on desktop, the City's sample ballot paragraph), whose data driven text can be
  larger: accepted, outside the Lighthouse run's viewport.
- The fixture server's wait is four simulated round trips (600 ms) rather than 100 ms, for
  margin on slower runners (CI painted at 111 ms against 100 ms answers).

## Order of work

1. Red: change the loading test to expect the Election Day heading and line while the
   precinct request hangs (later revised: nothing focusable in the skeleton). Run it, see it fail.
2. Green: the two component changes.
3. Gate, build, `npm run test:perf` and compare.

## Risks

- A later, larger LCP candidate: the loaded summary's line is a new node of the same size,
  which does not create a new LCP entry; checked with Lighthouse.
- Layout shift between skeleton and summary: Lighthouse CLS cannot see it (the skeleton's
  nodes are replaced, not moved), so an e2e test measures the line before and after.
  Residual, accepted: a precinct with a status banner (Not In Election, Nonresidential,
  unknown status) gets the banner above the summary, which pushes the line down once; the
  banner depends on the precinct's data. Below the hold's width a municipality short enough
  for one line moves the line up 24 px; above it a line long enough for two moves it down
  24 px. The holds sit at the width where the longest place line fits on one: County below
  400 px ("Unincorporated St. Louis County", 368 px of text), City below 448 px (Ward 28,
  Precinct 10, 414 px). So a shorter City line, such as W01P12's (405 px), still moves up
  24 px from 437 to 447 px. Measured by the third and fourth finders.
- A not-found or failed code shows the Election Day line for the moment before its error:
  the line is true for every St. Louis City and County voter, and the error replaces it.
- First-load JS: a few bytes; checked by the build test.

## Proof

- `PrecinctPage.test.jsx` loading test: criterion 1.
- `e2e/a11y.e2e.js` "the Election Day line stays put": criterion 6.
- Existing summary tests (`ResultsSummary.test.jsx`, `PrecinctPage.test.jsx`): criterion 2.
- `npm run test:perf` output: criterion 3, plus the control run of main with the revised
  harness. `npm test` build test: criterion 4.
- Live drive: Playwright against `vite preview` with the precinct response held back shows
  the Election Day line before the precinct answers, then the loaded page with one
  "Election Day" heading.
