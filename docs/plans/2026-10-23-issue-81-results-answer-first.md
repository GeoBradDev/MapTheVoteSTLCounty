# Plan: Results page: answer first, shorter mobile layout (issue #81)

Risk tier: High. Stateful UI across both jurisdictions (County and the lazy City chunk), the
early voting line count loop, focus and skeleton behavior, many files, and an LCP budget that
is already close to its limit (#156). Altering existing behavior, not adding.

Domain skills:
- frontend-design:frontend-design: invoke (new summary layout and compact rows).
- vercel-react-best-practices: invoke (React components, no extra requests or re-renders).
- chrome-devtools-mcp:a11y-debugging: invoke (headings, disclosures, tap targets; checked with
  the repo's Playwright axe run, which is the gate).
- chrome-devtools-mcp:debug-optimize-lcp: invoke (/p/CC007 and /p/W01P12 LCP near 2.5 s).
- superpowers:test-driven-development: invoke.
- Payments, email, API, data skills: not applicable because the change is front end layout only.

Owner decisions (relayed 2026-10-23): the precinct map is always shown under the polling
places list on phones, still lazy-loaded; the Districts card is collapsed by default on phones
and open on wide screens. #78 (shared Button, Link, Card, Notice) is not done: reuse what
exists, keep new styling local, note it for #78.

## Acceptance criteria

1. At 360 x 640, the first screen of `/p/CC007` and `/p/W01P12` shows the nearest Election Day
   polling place with a directions action, the Election Day date and hours, and the sample
   ballot action or the first fold of it.
2. During early voting at 360 x 640, the first screen also shows the nearest open early voting
   site of the precinct's own jurisdiction and its current line count, or the no-data state,
   with a link to every site's wait (/early-voting).
3. The page is at least 40% shorter at 360 px with every section in its default state
   (measured on the production build with the e2e fixtures, County precinct during early
   voting, against `origin/main`).
4. All results-page unit tests, `e2e/a11y.e2e.js`, `e2e/failures.e2e.js` and the Lighthouse
   budgets for `/p/CC007` and `/p/W01P12` pass; budgets are not loosened.
5. No change to what is fetched or what is in the URL: the summary reuses the cards' shared
   requests (getPolls, getEarlyVotingSites) and the same line count loops (County: the shared
   store; City: the City chunk's store), subscribing only while early voting runs.
6. Every #18 failure state (retry, slow notice) and focus behavior (heading takes focus on
   arrival; "Show more" moves focus to the first new row) keeps working.
7. Hours, dates and links still come from the config; copy lives in `src/i18n/en.json`.
8. Nonpartisan and official-sources rules hold: counts keep "Reported by" the board; the City
   ballot keeps its all-precincts wording.

## Files that change

- `src/features/lookup/PrecinctPage.jsx`: h1 becomes "Where you can vote"; a subtitle line
  "Precinct CC007" plus the municipality (keeps `data-testid="municipality"`); "Search another
  address" and a compact Share button on one row. A valid code that is not found keeps
  "Precinct not found" as its h1.
- `src/features/lookup/ShareLink.jsx`: compact button with a share icon; the privacy note as
  small help text tied to the button with `aria-describedby`.
- `src/features/lookup/ResultsSummary.jsx` (new): the answer-first summary. Sections, each
  with its own h2: "Election Day" (date and hours from config, nearest polling place with
  distance, address and a full-width directions link), "Vote early today" during early voting
  only (the nearest site open now, else the nearest site, with its status, its line count or
  "No current line count", directions and the wait times link), and "Sample ballot" (the
  existing County or City ballot card body). The "distances are from the center" note moves
  here, once, from both cards.
- `src/features/lookup/ResultsCards.jsx`: renders the summary, then the polls, early voting
  and districts cards (the ballot moves into the summary, so it comes earlier than #11's
  order); the skeleton gets a summary-shaped block.
- `src/features/lookup/PollsCard.jsx`: compact rows (name with distance on the right,
  address, room, entrances, directions links), `fromCenter` and the early voting pointer
  removed, map height smaller on phones.
- `src/features/lookup/EarlyVotingCard.jsx`: compact rows, `fromCenter` removed, the County
  dates and hours behind a disclosure ("See dates and hours"), exported helpers the summary
  reuses (County schedules, scheduleOf, waitKeyOf, the wait join).
- `src/features/lookup/CityEarlyVotingCard.jsx` and `src/cityChunk.js`: export a City summary
  piece (`CityEarlyVoteSummary`) built on the City store, so the City summary uses the City
  chunk's loop and schedules.
- `src/features/lookup/DistrictsCard.jsx`, `CityDistrictsCard.jsx`: the list in a disclosure,
  closed on phones (under 640 px) and open on wider screens.
- `src/features/lookup/Disclosure.jsx` (new, local; #78 can absorb it).
- `src/features/lookup/PrecinctMap.jsx`: map box `h-56 sm:h-64`.
- `src/features/lookup/resultsCopy.js`, `src/i18n/en.json`: new copy.
- Tests: the results page unit tests that assert the old heading, card order, fromCenter
  placement and hours placement; new tests for the summary and disclosures.
- `e2e/a11y.e2e.js`, `e2e/failures.e2e.js`, `e2e/prerender.e2e.js`, `e2e/lighthouse.js`:
  heading text and opening the districts disclosure at phone width.
- `README.md`: the Performance section's list of what the results page check looks for, if it
  changes.

## Order of work

1. Copy keys and the Disclosure component (with tests).
2. ResultsSummary for the County (tests first), then the City piece.
3. ResultsCards and PrecinctPage header and ShareLink.
4. Compact PollsCard and EarlyVotingCard rows; schedules disclosure; districts disclosure.
5. Update existing unit tests for the moved content; e2e and lighthouse checks.
6. Measure page height before and after with the fixtures at 360 x 640; screenshots.
7. Full gate: lint, format check, tests, build, e2e, perf.

## Risks

- LCP: the summary adds content that waits on the polls layer. The largest text should stay
  small; measure with `npm run test:perf` and keep the budget with margin.
- The City summary needs the City chunk: rendered under Suspense with a fallback that holds
  its height, and the chunk is already loaded with the City data.
- Two hooks read the same layer (summary and card): getPolls and getEarlyVotingSites are
  shared cached requests, so no second request; verified in the unit tests by counting fetches.
- A failed polls load: the card shows the error and retry; the summary shows nothing for the
  nearest place (no second alert). After a successful retry the summary stays empty until the
  next refresh; accepted and noted.
- Districts disclosure default depends on `matchMedia`; without it (jsdom) it is open.

Not done here: Election Day line counts in the summary (the card has them, #107), analytics
(#70 not merged), shared components (#78).

## Proof

- Unit: ResultsSummary tests (County and City, during and outside early voting, no-data
  state, loading, no extra requests, wait loop off outside early voting) cover 1, 2, 5, 7, 8.
  Existing PrecinctPage, PollsCard, EarlyVotingCard, Districts and retry tests cover 6.
- e2e: a11y and failures specs cover 4 and 6; lighthouse covers 4.
- Live drive: the production build with fixtures at 360 x 640 (County and City, during early
  voting, Election Day, after early voting), screenshots of the first screen and full page
  heights before and after for criterion 3.
