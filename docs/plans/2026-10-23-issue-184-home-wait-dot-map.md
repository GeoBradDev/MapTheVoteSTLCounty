# Plan: Home page live wait-time dot map (issue #184)

Risk tier: High. The most visited page, stateful UI driven by the clock and two
live data sources, a new build step that adds a script to every page's head,
and changes across many files. The owner's decisions in the issue body are the
approved plan (coordinator: do not re-ask), so this plan is committed without a
further pause.

Domain skills:
- frontend-design: invoke (the map is the page's signature element).
- dataviz: invoke (classes, ramp, legend, sizes, not color alone).
- vercel-react-best-practices: invoke (lazy chunk, first-load budget, hydration).
- superpowers:test-driven-development: invoke.
- chrome-devtools-mcp:a11y-debugging / debug-optimize-lcp: not applicable
  because axe and the LCP checks run in Playwright and Lighthouse in the gate.
- django, fastapi, expo, react-native: not applicable because this is a Vite
  React web app.

## Acceptance criteria

1. In each map state (early voting with a site open, early voting with every
   site closed, the evening of November 2 after early voting closes, Election
   Day with polls open, and Election Day before polls open) the home page shows,
   above the address search, a block with: a heading, a status line, an inline
   SVG map with the County and City outlines and one dot per site, a legend with
   the same Jenks classes and teal-to-brown ramp as `/early-voting`, the board
   rule line (`waitTimes.city` or `waitTimes.electionDay.city`), and a text
   summary of the three open sites with the fewest people in line (or, when
   every site is closed, when they open again).
2. Outside the map states (before early voting, after polls close on Election
   Day, the config flag off, JavaScript off) the home page is today's home page:
   no box, no space, no wait requests.
3. If the map's chunk fails or a board's site list fails, the box closes and
   today's home page shows with its "See early voting wait times" link. Counts
   that are stale or cannot be loaded keep the box (revised during
   implementation, see Revisions): every site is a hollow ring and the block
   says no site has a current count, or that counts could not be loaded.
4. County and City sites are kept apart: both outlines drawn, the City shaded
   apart and labeled, each summary row names its board, and the rule line says
   each board's sites are for its own voters.
5. Dots grow with class (not color alone); a closed site or one with no count is
   a hollow gray ring.
6. The h1 and intro stay the LCP; the box is reserved before the app's script
   runs, so nothing below it moves when the map arrives (no-move test).
7. First-load JavaScript stays under 120 KB gzipped; the map, outline and model
   load in their own chunk.
8. axe clean at 360 and 1280 px, light and dark, in the map states; the theme
   guard (no red or blue) and the contrast tests pass.
9. No request carries an address or location; the map never centers on the
   voter. Wait counts are never cached (network only, #25).
10. One config line (`waitTimes.homeMap`) turns the map off.
11. `scripts/build-outline.mjs` builds the committed outline module from the
    official County and City layers (Douglas-Peucker in the repo, no new
    dependency), under 2 KB gzipped for both; `--check` runs in the daily data
    health check.
12. `docs/data.md` and the README describe the outline script and its source.

## Design

- Box position: after the home `<header>`, before the existing "See early
  voting wait times" link, which stays as the "see every site" link under the
  box in every state. The home h1 and intro do not change (the mockup's "Lines
  at early voting now" becomes the box's h2), so the LCP text and every test of
  the home heading stay as they are.
- Reserving the box before the app runs: the page is pre-rendered at build time
  and cannot know the date. A tiny classic script, `/assets/home-map-<hash>.js`,
  built from the config, runs in the head before first paint and sets
  `data-home-map` on `<html>` while the date is inside the map window (from
  midnight of the first early voting day to Election Day's poll close, in the
  election's zone). CSS shows the box (`min-height` per breakpoint) only then.
  CSP stays `script-src 'self'`: the script is a same-origin file, not inline.
  It loads in parallel with the stylesheet, which already blocks render. After
  hydration React sets `data-open` or `data-closed` on the box, which win over
  the html attribute (a closed box is `display: none`).
- Map: inline SVG, `aria-hidden`, inside one link to `/early-voting` with a
  plain name. Outline projection: longitude scaled by cos(38.6 deg), latitude
  as is, fitted to a fixed viewBox, coordinates rounded to 0.1 unit. County
  outline stroked, City filled with the sunken surface and labeled "City"; a
  "St. Louis County" label; graticule ticks at the frame (four of latitude, three
  of longitude), labeled where no outline is drawn (the quiet, precise signature).
- Dots: filled with the wait tokens (`fill-wait-1..5`), ink hairline, radius by
  class index; hollow `stroke-muted` rings for closed or no count, drawn first
  so counted dots sit on top.
- Data: the same sites and counts as `/early-voting`: the County absentee sites
  (or polls on Election Day) and the City's early voting sites (or polls), via
  the site loading code moved from `WaitTimesPage.jsx` into `waitSites.js`, and
  `useWaitTimes()` (the shared 30 s loop, fresh only).

## Files that change

- `scripts/build-outline.mjs` (new): fetch, simplify, project, write
  `src/features/waitTimes/outline.js`; `--check` compares the rebuilt module
  with the committed one.
- `src/features/waitTimes/outline.js` (new, generated) and `outline.test.js`.
- `src/features/waitTimes/homeMapWindow.js` (new, plain, Node-safe) and test:
  the window's start and end instants and `inHomeMapWindow(now)`.
- `src/prerender/homeMapScript.js` (new Vite plugin) and test; `vite.config.js`.
- `src/features/waitTimes/dotMapModel.js` (new, pure) and test with fixtures
  per calendar state.
- `src/features/waitTimes/waitSites.js` (new): `useSites`, `combine`, the board
  parts and the City loaders, moved from `WaitTimesPage.jsx` unchanged.
- `src/features/waitTimes/WaitTimesPage.jsx`: imports them.
- `src/features/waitTimes/WaitDotMap.jsx` (new, lazy) and test.
- `src/features/lookup/HomePage.jsx`, `homeCopy.js`, `HomePage.test.jsx`.
- `src/i18n/en.json`: `home.waitMap.*`.
- `src/config/election.js`: `waitTimes.homeMap: true` and its typedef.
- `src/index.css`: the box rules.
- `e2e/a11y.e2e.js`, `e2e/prerender.e2e.js`, `e2e/lighthouse.js`: home in each
  map state, no-move, LCP before data, closed outside the window.
- `.github/workflows/data-health.yml`: outline check step.
- `docs/data.md`, `README.md`.

## Order of work

1. Outline script, generated module, tests.
2. `homeMapWindow.js` + tests; Vite plugin + build test.
3. `dotMapModel.js` + tests.
4. Move site loading into `waitSites.js` (WaitTimesPage tests stay green).
5. `WaitDotMap.jsx`, HomePage box, CSS, copy, flag; unit tests.
6. e2e and Lighthouse coverage; measure and set the reserved heights.
7. Docs, health check, screenshots.

## Risks

- Reserved height vs content height: text wraps by width and font. Mitigation:
  fixed map height, single-purpose rows, reserved heights measured at 360 and
  1280 px with margin; the no-move e2e test enforces it.
- A box text block larger than the intro would become the LCP. Mitigation: the
  rule line sits at the bottom of the box (below the fold at 360 x 640), the
  summary is a list of short items, the LCP e2e test checks every entry paints
  before the data answers.
- The head script adds a request to every page: same origin, a few hundred
  bytes, hashed and immutable, fetched in parallel with the CSS.
- Refactoring the site loading out of `WaitTimesPage.jsx`: moved verbatim; its
  existing tests cover it.
- Real clock in CI: e2e and Lighthouse runs of `/` without a pinned clock can
  land in any state; the map states are tested with pinned clocks.

Not done: the mockup's "Lines at early voting now" as the h1 (it would change
the LCP text and the pre-rendered heading); tappable single dots (44 px rule);
centering on the voter (privacy).

## Proof

- Criteria 1, 3, 4, 5: `dotMapModel.test.js` per state; `WaitDotMap.test.jsx`;
  `HomePage.test.jsx`; e2e at pinned clocks.
- Criterion 2: `HomePage.test.jsx` (outside window, flag off), e2e after polls
  close and with JavaScript off, build test (no script with the flag off).
- Criterion 6: e2e no-move and LCP-before-data tests; Lighthouse `/` at pinned
  clocks.
- Criterion 7: build test budget; criterion 8: e2e axe routes, theme and
  contrast tests; criterion 9: e2e request check for `/`; criterion 11:
  `outline.test.js`.
- Live drive: build, preview, drive `/` at each pinned clock in light and dark
  at 360 and 1280 px, screenshot each.

## Revisions

- Stale or failed counts keep the box instead of closing it. The issue's table
  closes it ("Wait data failed or stale"), but the box is already on screen at
  its reserved height by then, and closing it moved everything below: the
  Lighthouse run of `/` on Election Day morning (no County Election Day counts
  reach the County's view, per the config) measured CLS 0.49 and a score of 78,
  under the 90 budget. The issue's limits may not be loosened, so the limits
  win. The box still closes when the map cannot be drawn at all (its chunk or
  a board's site list fails).
- The map loads with the wait times page's chunk (a re-export from
  `WaitTimesPage.jsx`) instead of a chunk of its own: as its own chunk the
  bundler moved React and the shared modules out of the entry into a second
  first-load chunk, about 2 KB more of the 120 KB budget.
- The map window's start and end reach the app as a build-time define
  (`__HOME_MAP_WINDOW__`), so the City's config stays out of the first load.
- The existing "address box above the fold on a 360 x 640 phone" check (#71,
  #80) now runs outside the map window; inside it the owner's layout puts the
  map first, and a new check keeps the statement, the h1 and the map's
  heading above the fold with the address search right after the box.
- Also changed, not in Files that change: `src/features/waitTimes/homeMapMode.js`
  (the browser side of the window, reading the define), `e2e/fixtures.js`
  (the closed, before-polls and after-polls clocks), `src/test/setup.js`
  (component tests get a failed `fetch` instead of the network, since the home
  page now loads data on its own), `src/test/checkConfig.test.js` (the health
  check's outline step) and the comments that state #165, which still holds
  for the home page's own text: the dot map repeats only the wait times page's
  line that each board's sites are for its own voters, as the issue asks.
- Review round 1: the head script drops its mark at load when the app never
  started (no empty box when the app's script fails); one board's failed
  counts are named in the status line; rows loaded for early voting are not
  shown once the day turns to Election Day; e2e and axe cover Election Day
  before the polls open.
- Review round 2: the privacy notice (`privacy.sent.waitTimes.text` in
  `src/i18n/en.json`) and the README's privacy statement now name the home
  page's map among the pages that ask the line count layers; the map asks
  them only while a site is open (`OFF_WAITS` otherwise), as the results
  page's cards do.
- Review round 3: the no-move e2e proves the app was held and the box
  reserved; the head-script failure e2e proves the mark was set first; the
  request e2e checks each board's own services from the config; the build
  test keeps the outline and the model out of the first load too; an e2e
  aborts the map's chunk; once shown, the map's text stays while a refresh is
  asked.
- Review round 4: while the first counts load after a site opens with the
  page open, the summary and status line stay empty instead of saying no site
  has a count, and a check older than 5 minutes is not shown as "checked at".
  `src/features/lookup/useNow.js`'s comment now names the home map among its
  readers.

