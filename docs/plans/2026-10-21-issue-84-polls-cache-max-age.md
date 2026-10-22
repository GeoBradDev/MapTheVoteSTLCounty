# Plan: Polling places are cached for the life of the tab (issue #84)

Risk tier: Medium. It alters existing behavior (the polls layer cache) and adds stateful UI
(refresh on return to a hidden tab, keeping rows when a refresh fails) that unit tests cover
with fake timers and a simulated `visibilitychange`, but that only a live drive fully shows.
No auth, money, migration or outward messages.

Domain skills:
- superpowers:test-driven-development: invoke.
- vercel-react-best-practices: invoke (a new shared hook with effects and an event listener).
- chrome-devtools-mcp: invoke for the live drive (hide and show the tab, fail a refresh).
- frontend-design, dataviz: not applicable because the only visible addition is one line of
  muted text in the existing card style.
- context7: not applicable because only React and the Page Visibility API are used.
- expo, django, django-ninja, fastapi, claude-api: not applicable because none of those
  stacks are involved.

Mode: commit. The owner authorized commits, pushing this issue branch, the PR and its squash
merge for this run, and delegated plan approval for this run.

## Acceptance criteria

1. `getPolls` and `getAbsenteeSites` reuse a loaded answer only while it is younger than the
   max age; a call after that fetches again. Concurrent calls still share one request in
   flight, and a failed fetch is still not kept.
2. The max age is 10 minutes, and 2 minutes on Election Day (`election.electionDate` in
   `election.timeZone`). Both live in `src/config/election.js` (`layerMaxAge`), and the rule
   "too old" is one helper (`src/data/freshness.js`) that the wait times client (#103) and
   the City layers (#87, #89, #24) can reuse.
3. When the tab becomes visible again and the list shown is older than the max age, the
   polling places card, the early voting card and (through the polling places card) the map
   markers refetch and show the new list without a reload, without the skeleton, and
   without resetting "Show more" or moving focus.
4. A refresh that fails keeps the rows already shown and adds one line saying when they were
   loaded (time in `election.timeZone`) and that they could not be checked for changes. A
   later successful refresh removes the line. A failed first load still shows the existing
   error and retry (#18).
5. The README states the rule (Election config section) and #25 and #24 get a comment.
6. No new origin, no storage, nothing partisan; the copy names no party or candidate.

## Files that change

- `src/config/election.js`: `layerMaxAge: { minutes: 10, electionDayMinutes: 2 }` plus its
  typedef line.
- `src/data/freshness.js` (new): `isFresh(at, maxAgeMs, now, skewMs = 0)` and
  `layerMaxAgeMs(now)`.
- `src/data/freshness.test.js` (new).
- `src/data/arcgis.js`: `sharedLayer` keeps `loadedAt` and refetches once stale; the resolved
  FeatureCollection carries `loadedAt` (ms) as a foreign member.
- `src/data/arcgis.test.js`: max age tests with fake timers.
- `src/features/lookup/useNearestSites.js` (new): the load effect both cards share, with
  `useRetry`, the visibility refresh and keep-rows-on-failure.
- `src/features/lookup/PollsCard.jsx`, `EarlyVotingCard.jsx`: use the hook; show the
  "loaded at" line.
- `src/features/lookup/resultsCopy.js`: `copy.polls.staleNote(time)`.
- Tests: `PollsCard.test.jsx`, `EarlyVotingCard.test.jsx` (refresh on visible, kept rows on
  failure, no refresh when fresh).
- `README.md`: Election config section.

## Order of work

1. Red tests for `freshness.js`, then the module and config.
2. Red tests for the `sharedLayer` max age, then the change.
3. Red card tests for the visibility refresh and kept rows, then the hook and cards.
4. README; comments on #24 and #25.

## Risks

- A refresh racing a code change or retry: the hook ignores answers from an effect run that
  was cleaned up (the existing `current` flag).
- A refresh failure must not hide a different precinct's error: rows are kept only when the
  refresh is for the same code and origin that produced them.
- Election Day boundary: the date is read in `election.timeZone`, never the device zone.
- Not done: refresh while the tab stays visible (a voter looking at the list for over 10
  minutes) and the service worker (#25). Return to a hidden tab is the case the issue names.

## Proof

- Criterion 1, 2: `arcgis.test.js` and `freshness.test.js` with fake timers.
- Criterion 3, 4: card tests that fire `visibilitychange` with the clock moved past the max
  age, assert a second `getPolls` call and the new rows, the kept rows and the note on
  failure, and no call when fresh.
- Live drive: on `npm run dev`, open `/p/CC007`, move the clock or use a short max age via
  devtools override, hide and show the tab and see a second polls request and an updated
  list; block the polls request and see the kept rows with the note.
