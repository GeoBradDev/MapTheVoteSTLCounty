# Plan: Polling places near you card, with distances and directions (issue #12)

Risk tier: High. Stateful async UI (two fetches, loading, error, "Show more" focus) that unit
tests can only simulate, platform-dependent directions links, a new hand-off of the lookup
point from the search to the results page (privacy-sensitive), and more than a few files.
Nothing touches auth, money, data writes or outward messages, so nothing forces High; it is
the sum of the raises. The run is unattended (dispatched by the owner's orchestrator, which
asks for sensible calls on low-stakes choices), so the plan is committed without an
interactive approval; the PR says so.

Domain skills:
- superpowers:test-driven-development: invoke.
- vercel-react-best-practices: invoke for the card component and its effects.
- chrome-devtools-mcp (chrome-devtools, a11y-debugging): invoke for the live drive (list,
  Show more focus, links).
- frontend-design: not applicable because the card uses the existing token classes and
  card layout from #11.
- context7: not applicable because only React, wouter and Testing Library APIs already in
  use are needed.
- expo, django, django-ninja, fastapi, claude-api, dataviz: not applicable because none of
  those stacks are involved.

## Acceptance criteria

1. The "Polling places near you" card lists the `election.nearbyPollCount` polling places
   closest to the looked-up point by straight-line (great-circle) distance, from the cached
   polls list (`getPolls`, #5). Every feature of `polls_2026_11_view` counts: the county's
   own Election Day app shows the whole layer with no filter, and the absentee sites also
   carry Election Day `loc` numbers. A feature without valid point coordinates is skipped.
2. Each row shows: the name in careful title case (`STLCC`, `UMSL`, `JFK` and the other
   initialisms in the data stay upper case; `Mc` names and ordinals read right), the street
   address in title case with the ZIP, and the distance in miles to one decimal.
3. Each row has a "Get directions" link to
   `https://www.google.com/maps/dir/?api=1&destination=<lat>,<lng>` built from the
   polling place's coordinates. On iOS (iPhone, iPad, iPod, or an iPad that reports itself
   as a Mac with touch), an extra "Apple Maps" link to
   `https://maps.apple.com/?daddr=<lat>,<lng>` is offered. Each link's accessible name
   includes the polling place name. The `gmap` field is not used: a feature without
   coordinates cannot be ranked by distance, so it never needs the fallback.
4. Election Day hours from `election.electionDayHours` ("6 a.m. to 7 p.m."), the in-line
   rule when `inLineAtCloseMayVote` is true, and a source link. The hours were decided in
   #1, so the row is shown, not hidden.
5. The note "You can vote at any polling place in St. Louis County." with a source link to
   `election.voteAnywhere.sources[0]`.
6. A "Show more polling places" button reveals `nearbyPollCount` more each press, moves
   focus to the first newly shown place, and disappears when every place is shown.
7. When the page was reached from a lookup, distances are from the looked-up point. The
   point is held only in memory (a module variable keyed by precinct code), never in the
   URL, `history.state`, or any storage; a reload or a shared link loses it. Without a
   point, distances are from the center of the precinct (area-weighted centroid of
   `getPrecinctGeometry`), and the card says so.
8. While loading, the card shows `aria-hidden` skeleton lines. If the polls or the
   precinct outline fail to load, the card says so and links the county's official lookup.
9. Distances are right to within 0.1 mi for 3 test cases, checked against WGS 84 geodesic
   distances computed independently (pyproj `Geod(ellps='WGS84').inv`).
10. All new text lives in `src/features/lookup/resultsCopy.js`; no party or candidate
    names; no new external origin is fetched (the directions links are navigation, which
    the CSP's `connect-src` does not govern), so `render.yaml` does not change.

## Files that change

- `src/features/lookup/nearbyPolls.js` (new): `distanceMiles(a, b)` (haversine, mean
  Earth radius 3958.8 mi), `nearestPolls(collection, origin)` (sorted rows with `miles`),
  `titleCase(text)`, `polygonCenter(geometry)`, `directionsLinks({ lat, lng })`,
  `isAppleMobile(navigator)`.
- `src/features/lookup/nearbyPolls.test.js` (new): unit tests, including the 3 distance
  cases against the pyproj reference values.
- `src/features/lookup/lookupPoint.js` (new): `rememberLookupPoint(code, point)` and
  `lookupPointFor(code)`, in memory only.
- `src/features/lookup/AddressLookup.jsx`: remember the point for the precinct code before
  navigating.
- `src/features/lookup/PollsCard.jsx` (new): the card body: fetches, sorting, rows,
  hours, note, Show more.
- `src/features/lookup/PollsCard.test.jsx` (new).
- `src/features/lookup/ResultsCards.jsx`: render `PollsCard` in the polls slot; take
  `code` and `origin` props.
- `src/features/lookup/PrecinctPage.jsx`: read the remembered point for the code and pass
  it down.
- `src/features/lookup/PrecinctPage.test.jsx`: route the stubbed fetch by layer, import
  the page fresh per test (the polls cache is per module), and narrow the "every card links
  to the official lookup" test to the cards still pending.
- `src/features/lookup/AddressLookup.test.jsx`: the point is remembered for the code and
  never written to the URL or storage.
- `src/features/lookup/resultsCopy.js`: the card's text and the time formatter.
- `docs/data.md`: note that the whole polls layer is the Election Day set.

## Order of work

1. `nearbyPolls.js` with its tests (TDD): distance, title case, sorting, center, links.
2. `lookupPoint.js` and the AddressLookup hand-off, with tests.
3. `PollsCard.jsx` with tests, then wire it into `ResultsCards` and `PrecinctPage`, and
   update the page tests.
4. Docs, gate, live drive.

## Risks

- Privacy: the point must not leak into the URL, `history.state` or storage. Tests check
  location history and both storages after a lookup.
- The polls cache is module-level, so tests that render the page must reset modules or
  they leak a cached result between tests.
- iOS detection by user agent is heuristic; the Google link is always shown, so a missed
  detection still leaves working directions.
- The centroid of a concave precinct can fall outside it; acceptable for "distance from
  the precinct's center", and the card says distances are approximate from the center.
- Riskiest step: the PrecinctPage test changes, since they were written for the pending
  card. Each change keeps the original assertion for the cards still pending.

## Proof

- Criterion 1, 2, 3, 9: `nearbyPolls.test.js`.
- Criterion 3 (platform), 4, 5, 6, 7 (both origins), 8: `PollsCard.test.jsx`.
- Criterion 7 (hand-off and privacy): `AddressLookup.test.jsx`, `PrecinctPage.test.jsx`.
- Criterion 10: `render.test.js` and `election-hardcoding.test.js` stay green unchanged.
- Live drive: search an address, see three nearest with distances, press Show more, check
  focus, check links; open `/p/CC007` directly and see the precinct-center note; confirm
  the URL is only `/p/<code>` and storage is empty.
