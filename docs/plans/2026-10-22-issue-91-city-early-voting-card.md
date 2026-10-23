# Plan: City early voting card: City Board sites, dates and hours (issue #91)

Risk tier: High. Stateful UI (sorting, held focus, live line counts), a changed module
boundary (the City chunk), existing County code refactored for reuse, async loading, and
many files. Not in a forced-High category.

Domain skills: superpowers:test-driven-development: invoke. vercel-react-best-practices:
invoke (lazy loading, bundle size). chrome-devtools-mcp:a11y-debugging: not applicable
because the e2e axe checks and jsdom axe tests cover the new markup; the live drive uses
Playwright. frontend-design: not applicable because the card reuses the County card's
design. Data skills (django, fastapi): not applicable, frontend only.

Plan approval: the issue's own recommendation (schedule in config, County card's code)
plus the coordinator's notes and the owner's #147 decision (2026-10-22: keep the 120 KB
budget, all City-only results UI in one on-demand chunk with the City data client).

## Acceptance criteria

1. The City early voting schedule lives in config with its official sources and a
   last-verified date: the City Board's polling places page (per-site hours) and its No
   Excuse Absentee page (the two weeks before the election). Per site, keyed by the
   layer's `facilityid`:
   - Buder, Schlafly, Julia Davis: Mon 1-4 p.m.; Tue 11-5; Wed-Thu 11-7; Fri-Sat 11-4:30;
     October 20 to November 2.
   - Carpenter, Kingshighway, Walnut Park: Mon 1-4; Tue-Thu 11-5; Fri-Sat 11-4:30.
   - St. Joan of Arc: as Buder, October 27 to November 2 only.
   - Board office: weekdays 8 a.m. to 5 p.m.; Saturday October 31 9 a.m. to 1 p.m.
2. A City precinct's Early voting card lists the City early voting sites nearest the voter
   (or the precinct center), each with today's status ("Open today until", "Opens today
   at", "Opens <date> at", or ended), its address, entrance notes, distance and
   directions, and its own dates and hours. Same code as the County card.
3. While early voting runs, each City row shows its current line count from the shared
   wait time loop (`waits.city`, joined on the site `name`), the nearby sort and the link
   to `/early-voting`, as the County card does since #105.
4. No eligibility rules in the card: it links the absentee learn topic and the City
   Board's No Excuse Absentee page. No County text on a City page.
5. Tests for a weekday, a Saturday, a Sunday (closed), the last day (November 2), and
   after early voting ends (the card says it has ended, as the County card does).
6. `/early-voting` lists the City sites with the County's, with their hours, status and
   line counts, and no longer says City sites are missing.
7. All City-only results UI (the City early voting card and #89's City Election Day rule)
   loads in one on-demand chunk with the City data client (`loadCityClient`), and the
   City schedule is in that chunk, not the first load. First-load JS stays under 120 KB
   gzipped with more room than before this change.

## Files that change

- `src/config/cityEarlyVoting.js` (new): the City schedule, sources, lastVerified, the
  site-to-schedule map. A config file loaded only with the City chunk.
- `src/test/election-hardcoding.test.js`: treat that file as config too.
- `src/cityChunk.js` (new): the one City chunk: re-exports `src/data/cityArcgis.js`, the
  City UI components and the City schedule.
- `src/data/jurisdictions.js`: `loadCityClient` imports the chunk; the City adapter's
  `getEarlyVotingSites` reads `getCityEarlyVotingSites`.
- `src/features/lookup/PollsCard.jsx`: City Election Day rule through `React.lazy` from
  the chunk.
- `src/features/lookup/EarlyVotingCard.jsx`: the nearest-sites list split out as an
  exported `EarlyVotingSites` that takes the schedule lookup, the wait source key, the
  row detail and the lookup link; the County card uses it unchanged in behavior.
- `src/features/lookup/CityEarlyVotingCard.jsx` (new, in the chunk): City card.
- `src/features/lookup/cityEarlyVoting.js` (new, in the chunk): expand the compact City
  schedule into the `ScheduleEntry` form `earlyVotingStatus` reads; weekday lines.
- `src/features/lookup/ResultsCards.jsx`: City `earlyVoting` body, lazy from the chunk.
- `src/features/waitTimes/WaitTimesPage.jsx`: City sites from the chunk, merged list.
- `src/i18n/en.json`, copy modules: the card intro made jurisdiction neutral; wait times
  intro covers both; the "City not listed" line goes.
- `scripts/check-config.mjs`: every City early voting site has a schedule.
- Tests: new City card tests, schedule tests, wait page City tests, city89 test updates.
- Docs: README (Election config, wait times steps), docs/data.md (City early voting).

## Order of work

1. Chunk restructure (move CityElectionDayRule), measure.
2. City schedule config + expander, with tests (weekday, Saturday, Sunday, last day, after).
3. Extract `EarlyVotingSites` from the County card (County tests stay green).
4. City card + ResultsCards wiring + adapter; tests.
5. Wait times page City sites; tests.
6. check-config, docs, full gate, live drive.

## Risks

- Bundle: Rolldown splitting a shared chunk out of the entry (seen in #89). Measured
  after each step; the chunk is reached only through `loadCityClient`, which the entry
  already holds.
- Refactoring the County card can regress its focus-hold and nearby sort; its existing
  tests must stay green unchanged.
- React.lazy suspends once even when the chunk is loaded: fallbacks keep layout (the
  card skeleton).
- The City Board office's layer hours omit the last Saturday; the config follows the
  City Board's page, not the layer text.

## Proof

- Criteria 1, 5: `src/features/lookup/cityEarlyVoting.test.js` and the City card tests
  (fake time at each day).
- 2, 3, 4: `src/features/lookup/CityEarlyVotingCard.test.jsx`, `PrecinctPage.city89.test.jsx`.
- 6: `src/features/waitTimes/WaitTimesPage.test.jsx` City cases.
- 7: `src/test/build.test.js` (first load, City client out of the first load) and the size
  measurement in the PR.
- Live drive: `npm run build && npm run preview`, open `/p/W01P12` and `/early-voting`
  against the live City layers, see the City sites, hours and counts.
