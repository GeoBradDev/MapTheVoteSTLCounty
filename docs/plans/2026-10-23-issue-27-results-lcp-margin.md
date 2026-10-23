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
   real: its "Election Day" heading, the date and hours line and the hours note with its
   source link, with the same classes as the loaded summary, inside a box styled as the
   loaded summary's box. The rest of the skeleton stays placeholders hidden from screen
   readers.
2. The loaded summary renders the same Election Day text with the same classes (one shared
   component, so they cannot drift).
3. `npm run test:perf`: /p/CC007 and /p/W01P12 median LCP under about 2200 ms; every route
   still passes its budgets; CLS not worse than main.
4. First-load JS stays under the 120 KB budget (`src/test/build.test.js`).
5. No budget is loosened; the full gate is green.

## Files that change

- `src/features/lookup/ResultsSummary.jsx`: export `ElectionDayPart` (the Part with the
  heading, the date and hours line and the hours note, then children) and `PlaceSkeleton`;
  `ElectionDay` uses `ElectionDayPart`.
- `src/features/lookup/ResultsCards.jsx`: `ResultsSkeleton`'s summary box renders
  `ElectionDayPart` with a `PlaceSkeleton`, then the remaining placeholder bars
  (`aria-hidden`), with the loaded summary's box classes.
- `src/features/lookup/PrecinctPage.test.jsx`: the loading test asserts the Election Day
  heading and line show while loading, and the placeholders stay hidden.

## Order of work

1. Red: change the loading test to expect the Election Day heading, line and source link
   while the precinct request hangs. Run it, see it fail.
2. Green: the two component changes.
3. Gate, build, `npm run test:perf` and compare.

## Risks

- A later, larger LCP candidate: the loaded summary's line is a new node of the same size,
  which does not create a new LCP entry; checked with Lighthouse.
- Layout shift between skeleton and summary: the box keeps the same classes; Lighthouse CLS.
- A not-found or failed code shows the Election Day line for the moment before its error:
  the line is true for every St. Louis City and County voter, and the error replaces it.
- First-load JS: a few bytes; checked by the build test.

## Proof

- `PrecinctPage.test.jsx` loading test: criterion 1.
- Existing summary tests (`ResultsSummary.test.jsx`, `PrecinctPage.test.jsx`): criterion 2.
- `npm run test:perf` output: criterion 3. `npm test` build test: criterion 4.
- Live drive: Playwright against `vite preview` with the precinct response held back shows
  the Election Day line before the precinct answers, then the loaded page with one
  "Election Day" heading.
