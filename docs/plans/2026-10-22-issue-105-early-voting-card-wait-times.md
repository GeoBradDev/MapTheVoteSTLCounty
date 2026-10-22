# Plan: Early voting card: show each nearby site's current wait and link to all wait times (issue #105)

Risk tier: High. Stateful, interactive UI on the results page (a sort control, a 30 s refresh
from the shared #103 loop, a list order that must not move focus), altering an existing card
that unit tests only partly exercise, plus a change to what the results page requests (the
privacy notice must follow). Nothing touches money, auth or outward messages; High comes from
the tier raises. The coordinator's standing instruction (early voting is running, ship
promptly, decide low-stakes choices, ask only for real decisions) stands in for the plan
approval gate, as it did for #103 and #104.

Domain skills:
- superpowers:test-driven-development: invoke.
- vercel-react-best-practices: invoke (derived state with useMemo, no subscription when not
  needed, stable keys).
- frontend-design:frontend-design: not applicable because the card keeps its existing look;
  the new lines reuse the #104 component and tokens.
- dataviz: not applicable because the card draws no chart or map scale.
- chrome-devtools-mcp:a11y-debugging: not applicable because the repo's Playwright axe run
  (e2e/a11y.e2e.js) checks /p/CC007 in Chromium, and jsdom axe runs in a11yPages.test.jsx.
- django, django-ninja-api, python-fastapi, expo, react-native: not applicable because the
  app is a static React site with no backend or native app.

## Decisions taken without the owner (low stakes, per the coordinator)

- The issue's "Shortest wait nearby" option reuses #104's sort and its copy: "Shortest line
  within 5 miles" (`NEARBY_MILES`), next to a new "Nearest first" (default). Distances are
  the card's own: from the looked-up point, or from the precinct center on a reload or a
  shared link.
- Rows with no fresh report show nothing extra; when none of the shown rows has a count, one
  line says "No current line count for these sites" (the #102/#104 no-data wording).
- The wait UI (counts, sort, no-data line) shows only while early voting is running
  (`earlyVotingSeason(...).kind === 'during'`). The link to `/early-voting` shows before and
  during, not after it ends. Outside `during` the card does not subscribe to the wait loop,
  so the results page asks the line count layers only while early voting runs.
- Using the precinct center as the origin on `/early-voting` when arriving from a results
  page (deferred by #104) is not done here: the card already offers the nearby sort from the
  precinct center, and a page origin needs a new route, its hosting rule and its tests.
  A follow-up issue records it.
- The #81 summary task is skipped (#81 is not done); a note goes on #81.

## Acceptance criteria

1. While early voting is running, each listed site with a fresh County report shows the
   #104 line ("About 12 people in line, reported 10:42 a.m.") and "Reported by St. Louis
   County Board of Elections", from one shared `WaitReport` component that the wait times
   page also uses. A site with no fresh report shows no per-row "no count" text.
2. When no shown site has a count (empty or stale data, or every site closed), one line says
   so, once, not per row.
3. A labeled radio group "Sort sites": "Nearest first" (default) and "Shortest line within 5
   miles", which orders the sites within 5 miles by `orderSites`'s `nearby` rule (open with
   a count by shortest line, then open without a count, then closed) and the rest by
   distance. Switching keeps "Show all" behavior.
4. A link "See wait times at every early voting site" to `/early-voting`, shown before and
   during early voting.
5. After early voting ends: no counts, no sort, no no-data line and no link; the card does
   not subscribe to the wait loop (no line count requests).
6. Focus stays put when the 30 s refresh changes a value: rows have stable keys, and while
   focus is inside the list the row order holds until focus leaves it.
7. Tests in `EarlyVotingCard.test.jsx` with the County fresh, County empty, and County stale
   (fresh shifted past the max age, as e2e/fixtures.js does) fixtures, with a closed site
   (a Sunday), after early voting ends, and the refresh-with-focus case; every existing
   early voting and #18 failure test still passes.
8. The privacy notice and README privacy statement say the results page's early voting card
   asks the line count layers while early voting runs; nothing about the voter is sent.
9. Every string is in `src/i18n/en.json` behind a copy module; nothing election-specific is
   hardcoded.

## Files that change

- `src/features/waitTimes/WaitReport.jsx` (new): the count line and "Reported by", or the
  quiet "No current line count" when asked; `WaitTimesPage.jsx` uses it.
- `src/features/lookup/EarlyVotingCard.jsx`: season, wait join, sort, link, no-data line,
  order hold. Optional `waitSource` prop for tests.
- `src/features/lookup/resultsCopy.js`, `src/i18n/en.json`: new card strings; privacy
  wait times text.
- `src/features/lookup/EarlyVotingCard.test.jsx`: new tests.
- `src/features/privacy/PrivacyPage.test.jsx` if its wait times assertion needs the new text.
- `e2e/a11y.e2e.js` / `e2e/lighthouse.js` only if the results page checks need the new
  content (they answer the wait layers from fixtures already).
- README (privacy statement), `docs/progress.md` (coordinator line).

## Order of work

1. Plan commit.
2. Extract `WaitReport`, page tests still green.
3. Card tests first (fresh, stale, empty, closed, ended, sort, focus hold), then the card.
4. Privacy copy and README.
5. Gate: lint, format check, tests, build, e2e, perf.

## Risks

- Subscribing on the results page adds two requests every 30 s during early voting; the
  loop pauses in background tabs and is shared with any other reader.
- Lighthouse on /p/CC007: the wait lines arrive after the rows and grow rows (layout shift).
  The fixtures server answers the wait layers; if CLS moves, reserve space or check the
  budget.
- Riskiest step: the order hold. Moving a focused row node blurs it in browsers, so the
  order must not change while focus is inside the list.

Chosen not to do: the #81 summary, the `/early-voting` origin from a results page (follow-up
issue), City sites (#91), analytics (#70).

## Proof

- Criteria 1 to 7: `src/features/lookup/EarlyVotingCard.test.jsx` with the #102 fixtures and
  a mocked clock; `WaitTimesPage.test.jsx` still green for the shared component.
- Criterion 8: `PrivacyPage.test.jsx`.
- Criterion 9: `src/test/election-hardcoding.test.js`, i18n tests.
- Live drive: dev server at `/p/CC007` (a precinct page) against live layers, sort by
  keyboard, the link, a 30 s refresh with focus on a row link.

## Revisions during implementation

- `src/features/lookup/PrecinctPage.test.jsx` ("loads only the precinct in the URL") now
  also allows the two line count layers, and checks those requests do not carry the
  precinct code: the results page asks them while early voting runs.
- `src/features/lookup/cardsRetry18.test.jsx` mocks the two wait fetchers (as an empty
  answer), since the card now reads the app's wait loop.
- `e2e/a11y.e2e.js` runs `/p/CC007` at the time the wait fixtures were recorded and waits for
  the card's counts, sort and link, so axe and reflow cover the new UI in Chromium.
- Lighthouse `/p/CC007` is unchanged against main (97, LCP 2415 ms on main, 2416 ms here).
