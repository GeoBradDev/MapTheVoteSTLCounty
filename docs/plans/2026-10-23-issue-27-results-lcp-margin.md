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
  margin on slower runners (CI's first paint was at 111 ms, its answers at about 210 ms).

## Outside early voting: owner decision (option 1, 2026-10-23)

The review rerun found that the fix holds only while early voting runs. Outside it (after
early voting closes on November 2, on Election Day, and after), the early voting part of the
summary is gone, so the summary's sample ballot paragraph sits inside 360 x 640 and, painted
with the precinct data, becomes the LCP on every font (pinned clock, Election Day: entries at
about 1600 ms against 1500 ms answers in the e2e test). With the 600 ms fixture wait,
Lighthouse would then measure about 3 s on both results pages from November 3.

The owner chose option 1 on #27: preconnect to the ArcGIS host precinct pages query, for
`/p/*` only, so the data driven paint gets the connection set up while the script downloads.

7. A precinct page (`/p/*`) is served with `Link: <https://services6.arcgis.com>;
   rel=preconnect; crossorigin`: one entry per distinct origin of the County's and the
   City's election `serviceRoot` (today both are services6.arcgis.com), and nothing else. No
   other path gets a `Link` header. Each origin is in connect-src and is a host the privacy
   notice names.
8. `vite preview` (the e2e and Lighthouse runs) sends the same header on the same paths,
   from the same constant, so CI measures it.
9. `npm run test:perf` measures /p/CC007 and /p/W01P12 at three pinned clocks: during
   early voting, the evening after early voting closes (November 2, 8 p.m. Central) and
   Election Day morning (`ELECTION_DAY_AT`). Every state passes the unchanged 2500 ms budget
   with the 600 ms fixture wait, and each run checks that the clock was pinned.
10. The e2e guard "paints its largest text before the data answers" pins an early voting
    clock, so it keeps testing the early voting layout after November 2 instead of failing
    on the real date.

Files, in addition to the ones above:

- `src/prerender/plugin.js`: `PRECINCT_PRECONNECT` (the header value, from the config's
  service roots) and `previewHeaders(pathname)`; `previewRoutes` sets them on page requests.
- `render.yaml`: the `/p/*` `Link` rule, with a comment.
- `src/test/render.test.js`: the rule equals `PRECINCT_PRECONNECT`, only `/p/*` gets it,
  its origins are in connect-src and in the privacy notice's hosts.
- `src/prerender/plugin.test.js`: `previewHeaders`.
- `e2e/lighthouse.js`: the pinned clock states for the two results routes.
- `e2e/a11y.e2e.js`: the LCP guard's pinned early voting clock.
- `README.md`, Deploy and Performance: the header, checked on production after deploy (PR
  previews keep the service's existing header rules).

## Finding: Lighthouse's simulation does not credit the preconnect (needs the owner again)

With criteria 7 to 10 done, `npm run test:perf` measured /p/CC007 at 3021 ms (after early
voting) and 3019 ms (Election Day), /p/W01P12 at 3014 and 3015 ms; the early voting states
pass (1504 and 1654 ms). A control run with the preview's `Link` header removed measured the
Election Day states at 3023 and 3013 ms: no difference. Lighthouse's Lantern simulation
starts every connection cold (`TCPConnection` `warmed = false`) and warms one only after a
simulated request on it finishes (`Simulator.js`), so a preconnect never shortens the
simulated ArcGIS requests. Chrome's own network throttling adds latency per request, not per
handshake, so it cannot show the gain either. The preconnect helps real phones, but no lab
run in CI can measure it. The LCP element in those states is the summary's "The sample ballot
shows the contests and measures on your ballot." paragraph, painted with the first batch of
five ArcGIS requests. Not merged; the question is back on #27.

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

- Criteria 7 and 8: `src/test/render.test.js` and `src/prerender/plugin.test.js`; a curl of
  `vite preview` and, after deploy, of production `/p/CC007`.
- Criteria 9 and 10: `npm run test:perf` and `npm run test:e2e` output.

- `PrecinctPage.test.jsx` loading test: criterion 1.
- `e2e/a11y.e2e.js` "the Election Day line stays put": criterion 6.
- Existing summary tests (`ResultsSummary.test.jsx`, `PrecinctPage.test.jsx`): criterion 2.
- `npm run test:perf` output: criterion 3, plus the control run of main with the revised
  harness. `npm test` build test: criterion 4.
- Live drive: Playwright against `vite preview` with the precinct response held back shows
  the Election Day line before the precinct answers, then the loaded page with one
  "Election Day" heading.

## Owner decision, second round (2026-10-23): the sample ballot intro while loading

The owner kept the preconnect and chose to show the sample ballot section's fixed intro
text while a precinct loads, for County and City, so the LCP element paints before the data
in every election-calendar state. The placeholder must not move, or be replaced by larger
data driven text, when the data arrives; the e2e LCP guard extends to the after early voting
and Election Day clocks. Every pinned clock state must pass the unchanged 2500 ms budget
with the 600 ms fixture wait; otherwise stop and ask again, loosening nothing.

11. One shared `BallotPart` (in `ResultsSummary.jsx`) renders the summary's "Sample ballot"
    heading and the jurisdiction's fixed intro (County `copy.ballot.intro`, City
    `copy.ballot.introCity`), then `children`. The loaded summary and the skeleton both use
    it, so the two cannot drift. `SampleBallotCard` and `CitySampleBallotCard` render only
    what follows the intro. A County precinct whose link fails the checks now shows the
    intro, then the "could not find" line, so the intro is never replaced by other text.
12. While a precinct loads, the skeleton's summary mirrors the loaded summary's parts for
    the precinct's jurisdiction and the clock: the Election Day part (with the hours note's
    real text, its sources as plain text, nothing focusable, and the place placeholder),
    then, only while that jurisdiction's early voting runs, the early voting placeholder,
    else the `BallotPart` with a placeholder for its button, hidden from screen readers.
    During early voting the sample ballot part sits below the early voting part, whose
    height depends on per-site hours and line counts, outside the 360 x 640 view; the skeleton keeps
    the placeholder there and the Election Day line stays the LCP (guarded).
13. The County's schedules are in the first load; the City's are in the City chunk, which
    the City precinct request loads first. So a City skeleton renders its season-dependent
    rest (the early voting placeholder or the `BallotPart`, then the cards' placeholders)
    once the chunk is here (`useSchedules` in `ResultsCards.jsx` reads the chunk's
    `citySchedules` through `loadedCityClient` and `loadCityClient`, no new request),
    appended below the Election Day part before the data: appended, so nothing visible
    moves. The County's renders at once with its schedules. (Implementation note: first
    planned as a City chunk component through `cityComponent`; a hook keeps the skeleton
    one component and leaves `src/cityChunk.js` unchanged.)
14. The intro does not move when the results replace the skeleton: County and City, at
    360 px and 1280 px, at the after early voting and Election Day clocks (e2e), and the
    loaded intro is the same text and size in the same place.
15. The e2e LCP guard "paints its largest text before the data answers" runs at the early
    voting, after early voting and Election Day clocks, for both test precincts.
16. `npm run test:perf`: every state of /p/CC007 and /p/W01P12 under 2500 ms with margin
    (target under about 2200 ms), with the 600 ms fixture wait.

Files: `ResultsSummary.jsx` (`BallotPart`, `HoursNote` plain text mode),
`SampleBallotCard.jsx`, `CitySampleBallotCard.jsx`, `ResultsCards.jsx` (`ResultsSkeleton`
by jurisdiction and clock, `useSchedules`), their tests (`PrecinctPage.test.jsx`,
`PrecinctPage.city89.test.jsx`, `ResultsSummary.test.jsx`, `SampleBallotCard.test.jsx`,
`CitySampleBallotCard.test.jsx`), `e2e/a11y.e2e.js`.

Result: `npm run test:perf` with the 600 ms fixture wait: /p/CC007 1502, 1503 and 1503 ms
(early voting, after early voting, Election Day), /p/W01P12 1655, 1654 and 1654 ms, CLS 0
everywhere; the e2e guards pass at all three clocks, County and City, at 360 and 1280 px.

Residual, accepted: a County precinct not in the election (banner, no ballot part) loses the
intro when it loads, and the banner, painted with the data, can be the LCP there, as on
main. The same for any boundary moment where the season changes between the skeleton and
the loaded summary.
