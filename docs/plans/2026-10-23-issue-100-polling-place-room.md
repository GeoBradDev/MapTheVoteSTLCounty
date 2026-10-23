# Plan: Polling place room, from the County's ACTIVE_ROOM field (issue #100)

Risk tier: Medium. A new external layer joined into two stateful cards (async load beside
the existing list, refresh), across config, data, UI, the health check and fixtures; no
auth, money, migration or outward messages. Plan approval: the run's instructions carry the
owner's decision (2026-10-23) to show the room and to take the issue to a merged PR.

Domain skills:
- superpowers:test-driven-development: invoke.
- vercel-react-best-practices: invoke (a new hook and props in two React cards; no extra
  waterfall on the first load).
- frontend-design: not applicable because the change adds one text line per row and one
  source line in the cards' existing styles.
- chrome-devtools-mcp:a11y-debugging: not applicable because the lines are plain `<p>`
  text; the existing axe e2e run covers the results page.
- dataviz, django, expo and the rest: not applicable (no charts, no backend, no mobile).

## Owner decision

2026-10-23: yes, show the room, labeled as coming from St. Louis County Board of Elections
data. County only: the City layer has its own entrance notes (#89).

## Live layer, re-checked 2026-10-23

`November_3_2026_Polling_Places_Dashboard_view/FeatureServer/0` (County org
`wkbq75VVf2MvUvs7`): `Query` only, CORS `*`, data last edited 2026-10-07. 221 rows, 200
`ACTIVE = 'ACTIVE'` and 21 `ACTIVE = 'ABSENTEE'`. `ACTIVE_ROOM` is filled on all 200
Election Day rows and on 20 of the 21 absentee rows (`LOCATION_ID` 614, Olivette City
Center, has none). The polls layer's `loc_abs` holds 601 to 621 on its 21 absentee sites.

## Acceptance criteria

1. The County polls card shows "Room: <room>" for each listed Election Day place whose
   `loc` has an `ACTIVE` row with a room, joined on `LOCATION_ID` = `loc`.
2. The County early voting card shows "Room: <room>" for each listed site whose `loc_abs`
   has an `ABSENTEE` row with a room, joined on `LOCATION_ID` = `loc_abs`.
3. When any shown row has a room, one line under the list says the rooms are from St. Louis
   County Board of Elections data.
4. A missing row, an empty room, a conflicting duplicate row or a failed request shows the
   place without a room line and never blocks, delays or errors the card.
5. Rooms are title-cased with care: room letters and codes stay upper case (`GYM A`,
   `EVENT SPACE A + B`, `MP1/MP2 ROOMS`, `ROOM HS109A`), words after `(`, `/`, `&`, `+`
   are cased (`Foyer/Hallway`, `Foyer (Church Entrance)`).
6. The query asks only `LOCATION_ID,ACTIVE,ACTIVE_ROOM`, no geometry, shared per page load
   with the #84 freshness rule, started on mount beside the polls request. A test fails if
   it names any staffing, photo, turnout or task field, or `*`.
7. City cards show no room and make no room request.
8. `scripts/check-config.mjs` checks the layer and its fields, and reports how many
   Election Day `loc`s and absentee `loc_abs`es have no room (a warning, not a failure).
9. A recorded fixture (`poll-rooms.json`) answers the room query in the e2e and Lighthouse
   fixture servers.
10. `docs/data.md` records the owner decision, moves the room field out of "Not for v1" and
    documents the join; the JS budget and Lighthouse budgets still pass.

## Files that change

- `src/config/election.js`: `layers.pollRooms` and a `pollRooms` block (where, field names,
  kind values).
- `src/data/arcgis.js`: `POLL_FIELDS` gains `loc_abs`; `ROOM_FIELDS`; `sharedLayer` takes
  extra query params; `getPollRooms`.
- `src/data/jurisdictions.js`: County `getPollRooms`; City none.
- `src/features/lookup/pollRooms.js` (new): `roomCase`, `roomIndex`, with no React, so the
  health check reads the same index; `src/features/lookup/usePollRooms.js` (new): the hook.
  (Revised in implementation: split so `scripts/check-config.mjs` can import the index.)
- `src/features/lookup/nearbyPolls.js`: rows gain `absLoc`; export `caseWord`.
- `src/features/lookup/PollsCard.jsx`, `EarlyVotingCard.jsx`: the room line and source line.
- `src/features/lookup/PrecinctPage.jsx`: starts the rooms request with its polls and
  early voting requests, before the precinct answers (revised in implementation: the cards
  mount only after the precinct loads, so the page's own early start is where "with the
  polls request" happens).
- `src/features/lookup/resultsCopy.js`, `src/i18n/en.json`: copy.
- `scripts/check-config.mjs`, `src/test/checkConfig.test.js`: layer and coverage check.
- `scripts/record-fixtures.mjs`, `docs/raw/fixtures/poll-rooms.json`, `e2e/fixtures.js`.
- Tests: `src/data/arcgis.test.js`, `src/features/lookup/pollRooms.test.js(x)`, card tests.
- `docs/data.md`, `README.md` (data sources line) where now wrong.

## Order of work

1. Config and data client (`getPollRooms`, field test). 2. `roomCase` / `roomIndex`. 3. Hook
and card lines. 4. Health check. 5. Fixture and e2e/Lighthouse servers. 6. Docs.

## Risks

- PR #163 edits the same cards, arcgis.js, nearbyPolls.js and check-config; rebase and keep
  both.
- The first-load budget has about 9 KB left; the new code is small and the request starts in
  an effect beside the polls request, so nothing waits on it.
- Not done: the `/early-voting` wait times page list (issue names only the two cards).

## Proof

- arcgis.test.js: the room query's params (fields exactly the three, no forbidden field, no
  geometry, GET), sharing and failure not kept (criterion 6).
- pollRooms.test.js: join on `loc`, join on `loc_abs`, no matching row, empty room,
  conflicting duplicate, casing (criteria 1, 2, 4, 5).
- Card tests: room line shown, source line shown, request failure shows the card without
  rooms, City shows none (criteria 1 to 4, 7).
- checkConfig.test.js: layer check and missing-room warning (criterion 8).
- e2e and Lighthouse run against the fixture; build.test.js budget (criteria 9, 10).
- Live drive: the results page for CC007 shows rooms on both cards from the live layer.
