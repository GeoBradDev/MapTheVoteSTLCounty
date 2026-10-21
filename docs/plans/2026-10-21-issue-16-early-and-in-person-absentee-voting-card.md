# Plan: Early and in-person absentee voting card (issue #16)

Risk tier: Medium. Date logic is fully unit-testable with a mocked clock, but the card is
stateful UI (loading, "show all", a clock that moves), replaces the pending placeholder in
an existing screen, adds a data query and touches several files. Nothing touches auth,
money, data writes or outward messages, so nothing forces High. The run is unattended
(dispatched by the owner's orchestrator, which asks for sensible calls on low-stakes
choices), so the plan is committed without an interactive approval; the PR says so.

Domain skills:
- superpowers:test-driven-development: invoke.
- chrome-devtools-mcp (chrome-devtools): invoke for the live drive.
- vercel-react-best-practices: not applicable because the card follows the existing
  PollsCard fetch pattern; no new rendering or bundle concern.
- frontend-design: not applicable because the card reuses the existing card layout and
  token classes.
- context7: not applicable because only Intl, React and Testing Library APIs already in use
  are needed.
- expo, django, django-ninja, fastapi, claude-api, dataviz: not applicable because none of
  those stacks are involved.

## Acceptance criteria

1. Sites come from the polls layer filtered by `election.absenteeWhere` (a query whose
   `where` is that string, read from config), never from `sat_name_export_2026_11`.
2. Sites are sorted by straight-line distance from the looked-up point (or the precinct
   center, with the same note PollsCard shows), nearest 3 (`nearbyPollCount`) first, with a
   "Show all" button that reveals every site and moves focus to the first newly shown one.
3. Each site shows its name, address, distance, directions link(s), its kind (Board of
   Elections office or satellite site), and `notes_abs` when it is not empty.
4. Dates and hours come only from `election.earlyVoting.schedules`, shown in two groups,
   Board of Elections (`boe`) and satellite sites (`abs`), each with its full schedule as
   readable lines. A source link and "Last verified <date>" come from
   `election.earlyVoting.sources` and `lastVerified`.
5. Each group has a status line computed in the `election.timeZone` (America/Chicago),
   whatever the device's zone: "Open today until 4:30 p.m.", "Opens today at 8 a.m.",
   "Opens Saturday, October 24 at 9 a.m.", or "Early voting has ended." The status updates
   while the page stays open (re-evaluated every minute).
6. A link to the mail-in and absentee ballot information in "How to vote" (`/learn`), plus
   the county election board's website (`countySiteUrl`), since "How to vote" has no
   content until #23 (added after review).
7. Date logic has unit tests with a mocked clock for: before opening, a weekday, a
   Saturday, Monday Nov 2, Election Day, and after; plus around midnight (Chicago vs UTC),
   a Sunday, and the DST change on Nov 1.
8. Failure (query error) or no sites: the schedule still shows, with a line linking the
   county's official lookup. No dates, URLs or layer names outside the config
   (`election-hardcoding.test.js` stays green). No new external origin, so `render.yaml` does
   not change.

## Files that change

- `src/data/arcgis.js`: `getAbsenteeSites()`, query `where: election.absenteeWhere`,
  `outFields: '*'`, `outSR: '4326'`, `f: 'geojson'`, normalized and shared like `getPolls`.
  Both now come from one `sharedLayer(layer, where)` helper (same behavior for `getPolls`).
- `src/features/lookup/distanceOrigin.js` (new): the "looked-up point, else precinct
  center" logic moved out of `PollsCard.jsx` so both cards share it.
- `src/features/lookup/PollsCard.jsx`: uses `distanceOrigin`; its `sourceName` helper moves
  to `resultsCopy.js` (exported) so the early voting card can name its source too.
- `src/data/arcgis.test.js`: request shape, normalization, sharing.
- `scripts/record-fixtures.mjs` + `docs/raw/fixtures/absentee-sites.json` (new, live).
- `src/features/lookup/nearbyPolls.js` + test: rows also carry `absType` and `absNote`.
- `src/features/lookup/earlyVoting.js` (new): pure date logic: `zonedNow`, `hoursOn`,
  `earlyVotingStatus`, `scheduleLines`, `formatLongDate`.
- `src/features/lookup/earlyVoting.test.js` (new): mocked clock cases.
- `src/features/lookup/EarlyVotingCard.jsx` (new) + test.
- `src/features/lookup/ResultsCards.jsx`: render the card in the `earlyVoting` slot.
- `src/features/lookup/resultsCopy.js`: card copy.
- `src/features/lookup/PrecinctPage.test.jsx`: route the absentee query, count the card as
  built.
- `docs/data.md`: note the card reads the filter from config (only if wording is wrong).

## Order of work

1. Record the fixture; `getAbsenteeSites` with tests.
2. `earlyVoting.js` with tests (TDD), including the mocked-clock cases.
3. `nearbyPolls` fields; `EarlyVotingCard` with tests; wire into `ResultsCards`; page tests.
4. Gate, live drive, docs.

## Risks

- Wrong time zone: the device may not be in Chicago. All "today" logic uses
  `Intl.DateTimeFormat` with `timeZone`; a test sets the process `TZ` to zones far from
  Chicago (UTC+14, UTC-11, UTC) and checks the status and dates are unchanged.
- Overlapping entries (the BOE weekday range spans the Saturday entries): weekday ranges
  skip Saturday and Sunday; if two entries match a date, the narrowest range wins.
- The hardcoding test scans test files too, so tests build dates from numbers or from the
  config, never ISO date literals.
- A second ArcGIS request per page; same origin, cached for the page's lifetime.
- "How to vote" (#23) has no topic pages yet, so the link goes to `/learn`; #23 can deepen
  it to a topic slug.
- Riskiest step: the date logic around closing time and midnight.

## Proof

- Criterion 1: `arcgis.test.js` checks the request's `where` equals `election.absenteeWhere`.
- Criteria 2, 3, 4, 6, 8: `EarlyVotingCard.test.jsx`, `PrecinctPage.test.jsx`.
- Criteria 5, 7: `earlyVoting.test.js` and a card test with `vi.setSystemTime`.
- Live drive: `/p/CC007` from a search and from a direct load shows 3 nearest sites,
  "Show all" shows 21, the Galleria shows its entrance note, the status lines read right
  for today's Chicago time.
