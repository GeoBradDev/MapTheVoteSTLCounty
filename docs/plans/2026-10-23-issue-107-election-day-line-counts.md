# Plan: Election Day line counts at polling places, reusing the early voting wait times (issue #107)

Risk tier: High. It changes a scheduled job (the data health workflow's cron and run
window), stateful live-refresh UI on three surfaces (polling places card, precinct map,
`/early-voting`), and the wait time client's contract, across more than a few files.
Plan approval: the task brief carries the owner's decisions for this issue (people in line
for both boards, #152's any-polling-place rule, fixed color bins from #104, ship the gated
UI despite the County source blocker, route choice left to this run); this plan follows
them and is committed without a separate pause.

Domain skills:
- superpowers:test-driven-development: invoke.
- vercel-react-best-practices: invoke (React UI, first-load budget, re-render on refresh).
- dataviz: not applicable because the map keeps #104's owner-approved bins, tokens and
  legend; no new chart, palette or encoding.
- frontend-design: not applicable because no new visual language; existing tokens and
  components only.
- chrome-devtools-mcp:a11y-debugging: not applicable as a skill run; the e2e axe suite
  (`npm run test:e2e`) covers the changed pages, and the live drive checks focus.

## Acceptance criteria

1. On Election Day (the config's `electionDate`, in the config's time zone) during
   `electionDayHours` (06:00 to 19:00), the wait time client reads Election Day counts: the
   County from a config-named layer, filter and join field (`Creator` = polls `username`
   today), the City from its voting locations layer filtered to its Election Day sites
   (`pollsWhere`), gated by Election Day hours, not the early voting schedule or the City's
   early voting hours field. Changing the County layer URL, where clause or join field is a
   config change only.
2. Units are people in line for both boards, kept with the value.
3. The polling places card shows, under each listed place with a fresh count, "About N
   people in line, reported 10:42 a.m." and who reported it; with counts on, it offers the
   "Nearest first" / "Shortest line within 5 miles" sort like the early voting card (#105),
   holds the order while focus is in the list, and shows one "No current line count for
   these places" line when none of the shown places has a count.
4. The precinct map colors each polling place marker by the #104 fixed bins (0-4, 5-14,
   15+), numbers still matching the list, with a "People in line" legend when any marker has
   a count; a count refresh redraws markers without refitting the camera.
5. `/early-voting` on Election Day lists every polling place of both boards (County polls
   layer, City `pollsWhere`) with each place's count, the board that runs it, today's
   Election Day hours and open status; heading, intro and list label say Election Day; the
   sort, location button and map work as during early voting. Outside Election Day it is
   unchanged.
6. With fresh fixtures, the card, map and `/early-voting` show counts; with stale or empty
   ones, nothing but the no-data state (rows with no count, the "no current count" line).
   Today's County view (`username LIKE 'abs%'`) yields no Election Day match, so the UI
   shows the no-data state until the County publishes counts.
7. A County precinct page shows only County polling places' counts and a City page only
   City ones (the County page never asks the City layer and vice versa); no copy suggests a
   County voter may use a City polling place or the reverse. `/early-voting` names each
   place's board and says each board's polling places are for its own voters.
8. The data health workflow also runs its wait time checks every 2 hours across Election
   Day hours (6 a.m. to 7 p.m. Central on the election date), and the config check judges
   Election Day counts against the polls layer and the City's Election Day sites on that
   day.
9. `scripts/check-config.mjs` checks every field the app now reads (`username` on the polls
   layer, the Election Day wait source's fields).
10. The early voting card, early voting wait times and every other existing behavior are
    unchanged outside Election Day; the first load stays under 120 KB gzipped.

## Files that change

- `src/config/election.js`: `waitTimes.county.electionDay` (`enabled`, `serviceRoot`,
  `layer`, `where`, `pollsField`), `waitTimes.city.electionDay` (`enabled`, `where`); JSDoc.
- `src/features/lookup/electionDay.js` (new): `isElectionDay(now)`,
  `electionDaySchedule` (one ScheduleEntry built from `electionDate` and
  `electionDayHours`), `electionDayStatus(now)`.
- `src/data/waitTimes.js`: `selectCountyElectionDayWaits(reports, polls, now)`,
  `selectCityWaits(rows, now, { electionDay })` gating by Election Day hours; shared helpers.
- `src/data/arcgis.js`: `POLL_FIELDS` adds the Election Day join field; `getCountyWaits` and
  `getCityWaits` pick the Election Day source on Election Day.
- `src/features/lookup/nearbyPolls.js`: rows carry `dayKey` (the polls row's Election Day
  join value).
- `src/features/waitTimes/useWaitTimes.js`: `countyWaits` and `cityWaits` single-board
  stores exported for the polls card.
- `src/features/lookup/NearbySort.jsx` (new): the sort radios, `withKeys`, `inHeldOrder`,
  moved from `EarlyVotingCard.jsx` and used by both cards.
- `src/features/lookup/EarlyVotingCard.jsx`: imports the moved helpers.
- `src/features/lookup/PollsCard.jsx`: counts, sort, held order, no-count line, link to
  `/early-voting`, bins to the map.
- `src/features/lookup/PrecinctMap.jsx`, `precinctMapView.js`: binned markers, legend,
  no refit on a bin-only change.
- `src/features/waitTimes/WaitLegend.jsx` (new): the legend, shared by both maps.
- `src/features/waitTimes/WaitTimesMap.jsx`: uses `WaitLegend`.
- `src/features/waitTimes/WaitTimesPage.jsx`, `waitTimesCopy.js`, `src/App.jsx` (fallback
  heading), `src/i18n/en.json`: Election Day mode and copy.
- `scripts/electionWindow.mjs`, `.github/workflows/data-health.yml`: Election Day cron.
- `scripts/check-config.mjs`: Election Day fields and Election Day wait checks.
- `src/data/waitTimes.fixtures.js`, `e2e/fixtures.js`: Election Day fixtures derived from
  the recorded fresh County fixture.
- Tests next to each module; `e2e/a11y.e2e.js` adds `/early-voting` and `/p/CC007` at
  Election Day.
- Docs: `README.md`, `docs/data.md` where their text becomes wrong.

## Order of work

1. Config and `electionDay.js`, with tests.
2. Selectors in `waitTimes.js` (red tests first), then `arcgis.js` fetchers.
3. Single-board stores; `NearbySort.jsx` extraction (EarlyVotingCard tests stay green).
4. PollsCard counts, sort and map bins; PrecinctMap legend and view.
5. `/early-voting` Election Day mode.
6. Health check window and check-config.
7. Fixtures and e2e.
8. Docs.

## Risks

- First-load budget (about 9 KB room): PollsCard, PrecinctMap and the wait client are in
  the first load. Keep additions small; the legend is a small component, not the wait times
  map module.
- A refresh every 30 s re-creating the polls array would refit the map camera: guard by
  comparing coordinates.
- The early voting card and the polls card both read the County layer; they never overlap
  (early voting season is `ended` on Election Day), and a fetcher's phase is decided per
  call.
- Copy crossing jurisdictions: every new string reviewed against criterion 7.
- Cron edits in YAML must stay equal to the constants in `electionWindow.mjs` (a test
  checks it).

Not done: an `inline` text parser (the issue's fallback only if counts come through that
field; nothing shows they will), Jenks breaks (owner keeps fixed bins).

## Proof

- Criterion 1, 2, 6: `src/data/waitTimes.test.js` and `waitFixtures.test.js` (Election Day
  selection, gating, join field from config, stale and empty fixtures), `arcgis.test.js`
  (the query each fetcher sends by phase).
- Criterion 3, 7: `PollsCard.test.jsx` (counts, sort, no-count line, County page never asks
  City and vice versa, gated off outside Election Day).
- Criterion 4: `PrecinctMap.test.jsx` (legend, bins passed), view unit where testable.
- Criterion 5: `WaitTimesPage.test.jsx` (Election Day list from polls layers, copy, status).
- Criterion 8: `scripts` tests for `windowFor`, the YAML cron test.
- Criterion 9: `checkConfig.test.js`.
- Criterion 10: the full suite and `src/test/build.test.js`.
- Live drive: build and preview with the clock set to Election Day at 9:05 a.m. (Playwright
  e2e at that time against the fixtures), the results page and `/early-voting` show counts,
  the sort and map; with the empty County fixture, the no-data state.
