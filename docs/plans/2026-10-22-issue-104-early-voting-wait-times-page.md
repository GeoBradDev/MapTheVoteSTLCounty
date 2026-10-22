# Plan: Early voting wait times page: every site's current wait and hours, no address needed (issue #104)

Risk tier: High. A new route with stateful, interactive UI (sort controls, device location,
a lazy-loaded map, a throttled live region) that unit tests only partly exercise, reading
the #103 shared refresh loop (async, timers), across many files including hosting config
(render.yaml) and the CI browser checks. Nothing touches money, auth or outward messages,
so High comes from the tier raises. The coordinator's standing instruction for this run
(early voting is running now, ship promptly, decide low-stakes choices, ask only for real
decisions) stands in for the plan approval gate, as it did for #103.

Domain skills:
- superpowers:test-driven-development: invoke.
- vercel-react-best-practices: invoke (derived state with useMemo, no fetch per render,
  the map behind a dynamic import).
- frontend-design:frontend-design: invoke (a new page; keep to the existing tokens and
  card styles).
- dataviz: invoke (the marker color scale and its legend).
- chrome-devtools-mcp:a11y-debugging: not applicable because the repo's own Playwright
  axe run (e2e/a11y.e2e.js) checks the new route in Chromium, contrast included.
- django, django-ninja-api, python-fastapi, expo, react-native: not applicable because the
  app is a static React site with no backend or native app.

## Decisions taken without the owner (low stakes, per the coordinator)

- Route name `/early-voting`.
- Default sort as the issue proposes: open sites first, then shortest reported line, then
  sites with no report by name; closed sites last, by name.
- County and City share one people-in-line scale and wording (owner decision on #103,
  2026-10-22, City `waittime` is people in line), so the issue's "City minutes" wording
  and separate scale are not built.
- City sites are not rows yet: the issue lists them "once their schedule is in config
  (#91)", and #91 is open. Until then the page links to the City Board's own wait times
  dashboard.
- Arriving from a results page with the precinct center as the origin is left to #105,
  which owns the link from the results page.
- "Shortest line within N miles" uses N = 5: the sites within 5 miles first, by the
  default order, then the rest nearest first.
- Color bins: 0 to 4, 5 to 14, 15 or more people in line.
- The status line is re-announced at most every 5 minutes.
- No analytics event: #70 has not landed.

## Acceptance criteria

1. `/early-voting` renders the wait times page: one `h1` with `tabIndex={-1}` that gets
   focus on arrival (`focusHeadingOnArrival`), and a tab title from `usePageTitle`.
2. The home page links to it as the first action next to the address search; at 360 x 640
   the link, the unofficial statement and the address box are all visible without
   scrolling.
3. One row per County early voting site (the absentee sites layer): its list number, name,
   address and ZIP, kind and open status (open now / opens at / opens on a later date),
   today's hours when it has any, the line count line ("About 12 people in line, reported
   10:42 a.m.", "No one in line, reported ...") or a quiet "No current line count",
   "Reported by St. Louis County Board of Elections" with a count, the entrance note
   (`notes_abs`) and directions links. A site is never hidden for having no count.
4. Sort controls are a labeled radio group, usable by keyboard: "Open now, shortest line
   first" (default), "Name, A to Z"; after "Use my location" succeeds, also "Nearest" and
   "Shortest line within 5 miles", with each row's distance. The coordinates stay in
   component state only: never in the URL, storage, a request or a log.
5. A "Show map" button loads the MapLibre map on demand (never in the first load); each
   marker shows the row's list number; markers of sites with a count are filled by bin,
   the rest are plain; a legend names the unit and the bins and is hidden when no site has
   a count. The bin colors are `--color-*` tokens, not red or blue, and each passes 3:1
   against the basemap background (a test computes it).
6. A single `aria-live="polite"` status line says when the counts were last checked
   ("Line counts checked at 10:42 a.m."), changing at most every 5 minutes, or that they
   could not be loaded. The list itself is not a live region.
7. With the County fresh fixture at 9:00 a.m. on 2026-10-22, every open site with a fresh
   report shows its count, unit, time and source. With the stale City fixture and the
   empty County fixture, no count appears anywhere, every row shows "No current line
   count", and the legend is hidden.
8. Before early voting starts the page says when it runs; after it ends it says so, hides
   the list, and links to the Election Day polling place lookup on the home page.
9. A disclaimer says counts are reported by each board's staff and change quickly, and
   links the official sources (the County's absentee voting lookup app, the City Board's
   dashboard).
10. render.yaml gives `/early-voting` `Cache-Control: no-cache`; `src/test/render.test.js`
    covers the path; `scripts/smoke.mjs` hard loads it and expects the app shell.
11. `e2e/a11y.e2e.js` checks the route; `e2e/lighthouse.js` measures it and checks the
    heading and each site's name; the first-load budget test still passes.
12. Every string is in `src/i18n/en.json` behind a copy module; dates, hours, board names
    and URLs come from `src/config/election.js` only.
13. Neutral wording: no "best", "avoid" or "recommended"; the sort is a sort, not advice.

## Files that change

- `src/config/election.js`: `sourceUrl` on `waitTimes.county` and `waitTimes.city` (the
  existing `sources` list keeps the same two URLs, built from the same constants).
- `src/config/election.test.js`: the new fields.
- `src/features/lookup/nearbyPolls.js`: `pollRows(collection)` (rows without distance,
  with the County wait join key `absentee`); `nearestPolls` builds on it.
- `src/features/lookup/useNow.js` (new): the minute clock, moved out of
  `EarlyVotingCard.jsx` so both read one.
- `src/features/waitTimes/siteOrder.js` (new) and test: the sort orders and the bins.
- `src/features/waitTimes/earlyVotingSeason.js` (new) and test: before, during, ended.
- `src/features/waitTimes/waitTimesCopy.js` (new): the page copy.
- `src/features/waitTimes/WaitTimesPage.jsx` (new) and test: the page.
- `src/features/waitTimes/WaitTimesMap.jsx` (new) and test, and
  `src/features/waitTimes/waitTimesMapView.js` (new): the lazy map.
- `src/features/lookup/mapStyle.js` (new): the basemap label recolor shared by both map
  views; `precinctMapView.js` uses it.
- `src/index.css`: three `--color-wait-*` tokens.
- `src/i18n/en.json`: `waitTimes` and `home.waitTimes`.
- `src/App.jsx`: the route.
- `src/features/lookup/HomePage.jsx`, `homeCopy.js`: the entry link.
- `render.yaml`, `src/test/render.test.js`, `scripts/smoke.mjs`, `src/test/smoke.test.js`.
- `src/test/a11yPages.test.jsx`, `e2e/a11y.e2e.js`, `e2e/lighthouse.js`, `e2e/fixtures.js`
  (answer the wait layers from the recorded fixtures).
- README (Deploy, pages list) and `docs/progress.md` (coordinator lines), where now wrong.

## Order of work

1. Plan commit.
2. Pure modules, tests first: `pollRows`, `siteOrder`, `earlyVotingSeason`, the color
   contrast test.
3. Copy and the page, tests first (fresh, stale, empty fixtures; sort by keyboard;
   location; before and after; status line throttle).
4. Map component and view.
5. Route, home link, hosting config, smoke, e2e, Lighthouse.
6. Docs.

## Risks

- The home link could push the address box below the fold at 360 x 640; the e2e check
  asserts all three in view.
- The pre-rendered home page must not differ between build and hydration: the link is
  always shown, never gated on the date.
- The wait loop polls every 30 s; the list re-renders each time but the live region only
  changes when its text changes, at most every 5 minutes.
- Lighthouse: the page fetches two more layers. The fixtures server must answer them, or
  the run waits on blocked requests.
- Riskiest step: the map view (WebGL, not testable in jsdom). It is extra help only,
  removed on any failure, as the precinct map is.

Chosen not to do: City rows (#91), the results page origin (#105), Election Day counts
(#107), analytics (#70), pre-rendering this page (its content is live).

## Proof

- Criteria 3, 4, 6, 7, 8, 9, 13: `src/features/waitTimes/WaitTimesPage.test.jsx` with the
  #102 fixtures and a mocked clock; `siteOrder.test.js`; `earlyVotingSeason.test.js`.
- Criterion 5: `WaitTimesMap.test.jsx` (lazy import, legend hidden with no counts) and a
  token contrast test.
- Criteria 1, 2, 11: `e2e/a11y.e2e.js` (new route, home link at 360 x 640),
  `e2e/lighthouse.js`, `src/test/build.test.js`.
- Criterion 10: `src/test/render.test.js`, `src/test/smoke.test.js`.
- Criterion 12: `src/test/election-hardcoding.test.js`, i18n tests.
- Live drive: the dev server at `/early-voting` against the live layers during open hours
  (screenshots at 360 x 640, keyboard through the sort, the map shown).

## Revisions during implementation

- The page is a lazy route (`React.lazy` in `src/App.jsx`): with it in the entry, the
  first-load JavaScript went from 116.2 KB to 121.7 KB gzipped, over the 120 KB budget. Its
  Suspense fallback holds the page's height so the footer does not jump (Lighthouse CLS).
- MapLibre now sits in one chunk shared by both map views; `src/test/build.test.js` checks
  that chunk, its two importers and the lazy page chunk instead of `precinctMapView` alone.
  The basemap label recolor moved to `src/features/lookup/mapStyle.js` for both views.
- New small files beyond the list above: `src/features/waitTimes/canDrawMap.js` (the WebGL
  check, out of the component file for fast refresh), `waitColors.js` (the bin tokens and
  classes, with `mapColors.test.js`).
- The #103 store gains `checkedAt` per jurisdiction (when a request last succeeded), which
  the status line reads; it is shown at most every 5 minutes, and "unavailable" shows only
  after 5 minutes with no success, so the line never flips on every refresh.
- The list sits under a visible `h2` "Early voting sites" (axe heading order).
- The privacy notice (`privacy.sent.useMyLocation`, `privacy.sent.map`) says how the wait
  times page uses the location and what the map's tile requests show, as the README requires
  for any change to what is used or sent.
- The board names in the source links come from `waitTimes.county.source` and
  `waitTimes.city.source`.
- Live drive found the location button stuck under StrictMode (its mounted flag was never
  set again after StrictMode's extra cleanup); the page tests now render in StrictMode.
- Review (finder 1): a failed map hides the "Show map" button; the map module is imported
  once and shared by every mount; an unchanged marker list is not redrawn; the Lighthouse
  check accepts the "has ended" page after the config's last day; the City note shows only
  while early voting has not ended.
- Review (finder 2): a found location switches the sort to "Nearest to you"; when the map
  fails with focus on its button, focus moves to the list's container; both boards' pages
  are linked under "Official sources" in every season (the City note names the link there);
  `/early-voting/*` gets its own `no-cache` rule; comments that said `precinctMapView.js`
  alone imports MapLibre or recolors the basemap now say otherwise.
- Review (finder 3): the live region (screen reader only) keeps the 5 minute throttle, and
  a visible line, hidden from screen readers, shows the latest check, so a sighted reader
  never sees a check time older than a row's report time. A recovery may announce at once;
  "unavailable" still waits 5 minutes after the last success. The "unavailable" text no
  longer claims hours are shown (the sites layer can be down too). On a hard load the page
  leaves focus where the voter put it while its code loaded; when early voting ends with
  the page open and focus goes with the list, focus moves to the heading. A test checks the
  location is never sent, stored or logged.
