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
3. While early voting runs, each City row shows its current line count from a wait time
   loop on the shared rules (#103) that asks only the City's layer (`waits.city`, joined
   on the site `name`; revised during implementation from "the shared loop", which also
   asks County layers), the nearby sort and the link
   to `/early-voting`, as the County card does since #105.
4. No eligibility rules in the card: it links the City Board's No Excuse Absentee page
   ("To vote by mail or with an absentee ballot, see the St. Louis City Board of Election
   Commissioners"). No County text on a City page. (Revised after review: the issue also
   asks for the learn topic, but today's absentee topic is written for County voters (its
   hours, office and mailing address), so a City page does not link it until the City
   topic of #94 exists. One new string, `results.earlyVoting.mailCity`.)
5. Tests for a weekday, a Saturday, a Sunday (closed), the last day (November 2), and
   after early voting ends (the card says it has ended, as the County card does).
6. `/early-voting` lists the City sites with the County's, with their hours, status and
   line counts, and no longer says City sites are missing.
7. All City-only results UI (the City early voting card and #89's City Election Day rule)
   loads in one on-demand chunk with the City data client (`loadCityClient`), and the
   City schedule is in that chunk, not the first load. First-load JS stays under 120 KB
   gzipped. (Revised after review: first written as "with more room than before this
   change". The measured first load is 46 bytes larger than main (50 bytes of room, from
   96): the shared County and City list costs about 150 bytes and every string is in the
   first load's en.json, while the City-only code and config moved out saved about 150.
   More room needs a split beyond City-only code, which is #147's open question.)

## Files that change

- `src/config/cityResults.js` (new): the values only the City's results cards read: the
  City early voting schedule (sources, lastVerified, the site-to-schedule map) and #89's
  Election Day rule, moved out of `election.js` to free first-load bytes. A config file
  loaded only with the City chunk. (Revised during implementation: first planned as
  `cityEarlyVoting.js` with the schedule alone; the card refactor left 11 bytes of room, so
  the rule moved too.)
- `src/test/election-hardcoding.test.js`: treat that file as config too.
- `scripts/check-content-links.mjs`: link-check that file's sources too.
- `e2e/fixtures.js`, `e2e/a11y.e2e.js`, `e2e/failures.e2e.js`: answer the City early voting
  sites query (it shares the wait query's layer and filter, told apart by `f=geojson`),
  axe the City card with a site's hours open, and expect the "unavailable" line when the
  City's counts fail (the page now lists City sites).
- `src/cityChunk.js` (new): the one City chunk: re-exports `src/data/cityArcgis.js`, the
  City UI components and the City schedule.
- `src/data/jurisdictions.js`: `loadCityClient` imports the chunk; the City adapter's
  `getEarlyVotingSites` reads `getCityEarlyVotingSites`.
- `src/features/lookup/PollsCard.jsx`: City Election Day rule through `React.lazy` from
  the chunk.
- `src/features/lookup/EarlyVotingCard.jsx`: the nearest-sites list split out as an
  exported `EarlyVotingSites` that takes the schedule lookup, the wait source key, the
  row detail and the lookup link; the County card uses it unchanged in behavior.
- `src/features/lookup/CityEarlyVotingCard.jsx` (new, in the chunk): City card. It runs its
  own City-only wait loop (`createWaitTimesStore` with the City fetcher), so a City page
  asks no County layer (the shared loop also asks the County's absentee sites).
- `src/features/lookup/cityComponent.js` (new): `cityComponent(name)`, `React.lazy` over
  `loadCityClient()`.
- `src/features/lookup/cityEarlyVoting.js` (new, in the chunk): expand the compact City
  schedule into the `ScheduleEntry` form `earlyVotingStatus` reads; weekday lines.
- `src/features/lookup/ResultsCards.jsx`: City `earlyVoting` body, lazy from the chunk.
- `src/features/waitTimes/WaitTimesPage.jsx`: City sites from the chunk, merged list; each
  row names its board; each board's sites show as they arrive (a slow board never holds up
  the other); one board's sites failing keeps the other's, with that board's lookup and a
  retry, and a board keeps the rows it last loaded through a failed retry; the status line says unavailable when either board's counts fail.
- `src/i18n/en.json`, copy modules: the card intro made jurisdiction neutral; wait times
  intro covers both; the "City not listed" line becomes "each board's sites are for its own
  voters". No new strings: every string is in the first load.
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
- React.lazy suspends once even when the chunk is loaded. The fallback is null, not a
  skeleton (a skeleton cost about 40 first-load bytes): the chunk is always loaded by the
  time a City card renders (the precinct came through it), so it suspends for a microtask,
  and the card's own skeleton then holds the layout.
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
