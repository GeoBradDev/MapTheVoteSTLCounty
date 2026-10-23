# Plan: Early voting map open by default, 3 to 5 Jenks natural breaks classes (issue #172)

Risk tier: High. It alters existing behavior (the map's default and every line count color on
two maps), the map loading is stateful UI that unit tests cannot fully exercise, and it
touches more than a few files. Scope approved by the owner's request quoted on the issue
(2026-10-23), including changing the tests that pinned the fixed groups and "Show map".

Domain skills:
- vercel-react-best-practices: invoke (React components, lazy loading, memoized derived state).
- dataviz: invoke (classed color scale and legend).
- chrome-devtools-mcp:debug-optimize-lcp: not applicable as a separate pass because the
  Lighthouse gate (`npm run test:perf`) measures LCP on `/early-voting` in CI and locally;
  the plan keeps the LCP element static and the map out of the first viewport's work.
- chrome-devtools-mcp:a11y-debugging: not applicable as a separate pass because the axe e2e
  gate covers `/early-voting`, and this plan adds the open map to that route's check.
- frontend-design: not applicable because no new visual design; the ramp is the owner's.

## Acceptance criteria

1. `/early-voting` shows the map without a tap (a "Hide map" button may collapse it).
2. Classes are Jenks natural breaks over the fresh counts shown, recomputed on each refresh.
   k rule: with fewer than 3 distinct values, k = the number of distinct values (1 or 2);
   otherwise the smallest k in 3..min(5, distinct) whose goodness of variance fit (GVF)
   reaches 0.9, else min(5, distinct). No fresh values: no classes, no colors, no legend.
3. The legend shows each class as a range with the unit ("0 to 3 people", or "5 people" for
   a one value class) plus "No current count"; markers keep their numbers.
4. Five BrBG-style tokens (teal to tan to brown), each not red or blue, 3:1 against the
   basemap with its ink outline, its number 4.5:1 on its fill, and every pair (and the
   no-count marker) at least 0.15 apart in OKLab. k classes use a fixed subset of the five.
5. The same rule on the precinct map on Election Day (#107): classes from that board's
   fresh counts at its listed polling places.
6. Unit tests for the breaks: typical spread, all equal, 1 or 2 distinct values, outliers, empty.
7. The map stays out of the first load and loads only when its box scrolls into view, with
   its space reserved, so `/early-voting` stays inside the Lighthouse budgets; a11y passes.

## Files that change

- `src/features/waitTimes/jenks.js` (new): `jenksGroups(values, k)`, `gvf`, `waitClasses(values)`
  returning `[{ min, max }]` contiguous integer ranges, `classOf(value, classes)` and
  `waitColor(value, classes)` (the marker's color step). Its own chunk.
- `src/features/waitTimes/useWaitScale.js` (new, revision): PollsCard is in the first load,
  so it loads jenks.js with `import()` only while Election Day counts are on.
- `src/test/build.test.js` (revision): jenks is its own chunk, outside the first load.
- `src/features/waitTimes/jenks.test.js` (new).
- `src/features/waitTimes/siteOrder.js` / `siteOrder.test.js`: drop `WAIT_BINS` and `waitBin`.
- `src/features/waitTimes/waitColors.js`: five tokens and classes, `colorsFor(k)` subset.
- `src/index.css`: `--color-wait-1` to `--color-wait-5` replace low/mid/high.
- `src/features/waitTimes/mapColors.test.js`: five tokens, subsets.
- `src/features/waitTimes/WaitLegend.jsx`: takes `classes`.
- `src/features/waitTimes/WaitTimesMap.jsx` (+ test): takes `classes`; markers carry a class
  index and the class count; waits for view (IntersectionObserver) like PrecinctMap.
- `src/features/waitTimes/waitTimesMapView.js`, `src/features/lookup/precinctMapView.js`:
  marker fill from `{ bin, classCount }`.
- `src/features/waitTimes/WaitTimesPage.jsx` (+ tests): map open by default, classes from
  the shown fresh counts.
- `src/features/lookup/PollsCard.jsx`, `PrecinctMap.jsx` (+ test): classes from the board's
  counts; PrecinctMap takes a `classes` prop for its legend.
- `src/i18n/en.json`, `waitTimesCopy.js`: legend copy with the unit.
- `e2e/a11y.e2e.js`: `/early-voting` route draws the map (blank basemap) and checks the legend.
- `README.md` (Map, Wait times: Election Day), `docs/data.md` if it names the bins.

## Order of work

1. Jenks module and tests (TDD).
2. Tokens, colors and color test.
3. Legend, map, map views with classes.
4. Page default open plus in-view loading; PollsCard and PrecinctMap.
5. Copy, e2e, docs. Full gate.

## Risks

- TBT/LCP from MapLibre loading on arrival: mitigated by in-view loading (the map sits
  below the first 640 px viewport in Lighthouse's mobile emulation) and the h-72 box.
- A color meaning differs between the precinct map (one board) and `/early-voting` (both
  boards on Election Day): accepted; each legend shows its own ranges.
- Ties and integers: classes are contiguous integer ranges from the data min to max, so
  every shown value falls in exactly one class.

## Proof

- Criterion 2, 6: `jenks.test.js`.
- Criterion 4: `mapColors.test.js`.
- Criterion 1, 3, 7: `WaitTimesPage.test.jsx`, `WaitTimesMap.test.jsx`, e2e a11y route for
  `/early-voting` with the legend, `npm run test:perf`.
- Criterion 5: PollsCard / PrecinctMap tests.
- Live drive: `npm run build && npm run preview`, open `/early-voting` at a desktop size,
  see the map and legend without a tap; at 360 px the map loads on scroll.
