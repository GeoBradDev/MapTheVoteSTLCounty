# Plan: Wait time client: County line counts and City waits at early voting sites, in one shape (issue #103)

Risk tier: High. A new data contract read by three later issues (#104, #105, #107), a
shared polling loop with visibility handling (async, timers, stateful hook a unit test
only partly exercises), new config, and more than a few files. Nothing here touches
money, auth or outward messages, so High comes from the tier raises, not a forced rule.
The coordinator's standing instruction for this run (keep moving, decide low-stakes
choices, ask only for real decisions) stands in for the plan approval gate.

Domain skills:
- superpowers:test-driven-development: invoke.
- vercel-react-best-practices: invoke (the `useWaitTimes` hook; `useSyncExternalStore`,
  no per-component effects that fetch).
- frontend-design, chrome-devtools-mcp:a11y-debugging, dataviz: not applicable because
  this issue adds no UI; #104 and #105 render the values.
- django, django-ninja-api, python-fastapi, expo, react-native: not applicable because the
  app is a static React site with no backend or native app.

## Acceptance criteria

From the issue, with the owner's #102 findings (comment on #103, 2026-10-22) applied:

1. `getCountyWaits()` in `src/data/arcgis.js` queries the County layer in config with
   `where=1=1`, `outFields=Creator,CreationDate,linecount`, `returnGeometry=false`,
   `orderByFields=CreationDate DESC`, `f=json`, as a cacheable GET with no voter data, and
   joins each report to an absentee site by `Creator` = the site's `absentee` field,
   newest report per site (criterion 5 then judges that report; an older one never
   stands in for it). A `Creator` matching no site is dropped.
2. `absentee` is in `POLL_FIELDS` in `src/data/arcgis.js` and in the polls fields
   `scripts/check-config.mjs` checks.
3. `getCityWaits()` queries the City layer in config with
   `where=publicview = 'Yes' AND earlyvoting = 'Yes'`, `orderByFields` the report time
   descending, `outFields` of only the site key (`name`),
   `waittime`, the report time (`created_date_1740505041182`), `comments` and the hours
   field (`earlyvotingoperhours`), `returnGeometry=false`. Never `outFields=*`.
4. Every entry has the shape
   `{ siteId, jurisdiction: 'county' | 'city', unit, value, reportedAt: Date, source, openUntil: Date }`.
   Both report people in line (the City unit by owner decision, 2026-10-22, matching the
   City Board's dashboard), so `unit` is `'people'` for both. The unit comes from
   config and is never converted. `openUntil` (added) is when the site closes
   today, so a kept entry can be dropped at closing without the schedule.
5. An entry is returned only when: its value is a non-negative integer; `reportedAt` is
   within `maxAgeMinutes` and not more than `skewMinutes` in the future (`isFresh` in
   `src/data/freshness.js`); and the site is open now. County open now is
   `earlyVotingStatus(schedules[abs_type])` = `openNow`. City open now is the site's
   `earlyvotingoperhours` for today's weekday in `election.timeZone`, the report is from
   today in that zone, and `comments` do not contain "poll closed" (the City dashboard's
   rules). Hours text that does not parse means closed (fail closed).
6. Config `waitTimes: { enabled, refreshSeconds: 30, maxAgeMinutes: 120, skewMinutes,
   sources, lastVerified, county: {...}, city: {...} }` in `src/config/election.js`, with
   each jurisdiction's layer URL, field names (the County join field `absentee`; #107
   switches it to `username`), unit, board name and its own `enabled`.
7. `useWaitTimes()`: one shared refresh loop for every reader: one request per enabled
   jurisdiction per `refreshSeconds`, however many components read it. It pauses while
   `document.visibilityState` is hidden and refreshes at once when the tab becomes
   visible. It stops when no component reads it.
8. A failed refresh keeps the last entries while each stays fresh and open (re-checked at
   each tick), then reports that jurisdiction `unavailable`. A failure of one jurisdiction
   never affects the other, and the hook never throws into the component tree.
9. Uses the #18 timeout and one retry (`query` in `src/data/arcgis.js`).
10. Privacy: no request carries an address, coordinates or a precinct; both layer origins
    are in the CSP `connect-src` (`render.yaml`), checked by a test.
11. Unit tests with a mocked clock cover: fresh; older than `maxAgeMinutes`; several
    reports for one site (newest wins); a `Creator` with no matching site; a
    `CreationDate` in the future; site closed now; null `linecount` and null `waittime`;
    the City stale rows from 2026-10-21 (never returned on 2026-10-22).
12. A helper gives the report time's display parts in `election.timeZone`.

## Files that change

- `src/config/election.js`: `waitTimes` block and its typedef.
- `src/data/arcgis.js`: `absentee` in `POLL_FIELDS`; `query` takes a full layer URL too;
  `getCountyWaitReports()` and `getCityWaitRows()` (the raw rows), `getCountyWaits()` and
  `getCityWaits()` (fetch plus select).
- `src/data/waitTimes.js` (new): pure selection: `selectCountyWaits`, `selectCityWaits`,
  `parseCityHours`, `stillShowable`, `reportedTimeParts`.
- `src/data/waitTimes.test.js` (new): the selection cases, mocked clock.
- `src/data/waitTimes.fixtures.js` (new): minimal fixtures built from real 2026-10-22 rows
  (#102 recorded them in its own branch; #102 may replace these with its files).
- `src/data/arcgis.test.js`: request shape for the two new queries.
- `src/features/waitTimes/useWaitTimes.js` (new): the shared loop
  (`createWaitTimesStore`) and the hook (`useSyncExternalStore`).
- `src/features/waitTimes/useWaitTimes.test.jsx` (new): one request per interval with
  several readers, pause and resume, failure keeps then ages out.
- `scripts/check-config.mjs`: the County join field (from config) in its polls fields.
- `src/config/election.test.js`: the `waitTimes` block's shape.
- `src/test/checkConfig.test.js`: the polls fields list.
- `src/test/render.test.js`: wait layers' origins are allowed by `connect-src`.
- `render.yaml`: the `connect-src` comment names the wait layers (no policy change).
- `docs/data.md`: a short pointer to the client under the wait times notes, only if a line
  there becomes wrong (the #102 branch rewrites that section; keep the edit minimal).

## Order of work

1. Config block (no behavior).
2. `waitTimes.js` selection, test first.
3. `arcgis.js` queries, test first.
4. Store and hook, test first.
5. check-config, CSP test, docs.

## Risks

- City hours are free text (`Mo (13:00-16:00); Tu-Th (11:00-17:00); Su (Closed))`). The
  parser accepts day ranges and the observed typos (missing space, extra `)`), and treats
  anything it cannot read as closed, so a format change hides City counts rather than
  showing wrong ones.
- County reports arrive about a minute before opening. They show once the site opens
  (the report is still fresh); nothing shows before opening.
- Merge with #102: #102 adds `docs/raw/fixtures/*waits*` and rewrites `docs/data.md`
  "Wait times". This branch adds no files under `docs/raw/fixtures/` and does not rewrite
  that section, so the merge stays clean.
- `openUntil` is computed from the minute of now; a DST change while a site is open does
  not happen in this election (sites are closed at 2 a.m. on November 1).
- The hardcoding test scans `src/` for config values: tests build URLs and dates from
  config, never literals.

Chosen not to do: no UI (#104, #105), no Election Day join (#107), no per-jurisdiction
config move (#86).

## Proof

- Criteria 1, 3, 9, 10: `src/data/arcgis.test.js` (request URL, parameters, GET, no
  coordinates; retry on 503), `src/test/render.test.js` (CSP).
- Criteria 4, 5, 11, 12: `src/data/waitTimes.test.js`.
- Criteria 7, 8: `src/features/waitTimes/useWaitTimes.test.jsx` with fake timers.
- Criteria 2, 6: `src/test/checkConfig.test.js` and `src/config/election.test.js` where
  they already cover the field lists and config shape.
- Live drive: a scratch script runs `getCountyWaits()` and `getCityWaits()` against the
  live layers during open hours and prints the entries; and the hook mounted in the dev
  server's console shows one request per jurisdiction per 30 s in the network log.

## Revisions during implementation

- The store and the hook share one file, `src/features/waitTimes/useWaitTimes.js`; a
  separate store module added nothing.
- Each jurisdiction in config has its own `serviceRoot` and relative `layer`, like the
  main layers: the hardcoding test treats a full URL ending in `/FeatureServer/N` as a
  layer path and would flag `https:` everywhere.
- `src/data/arcgis.js` keeps the raw row query private (`waitRows`) instead of exporting
  `getCountyWaitReports()` and `getCityWaitRows()`: nothing reads raw rows yet. #107 can
  export it when it needs one.
- Review (finder 1): each site's newest report is judged, and an older one never stands
  in for it (a newer report with no count, or a City row saying "poll closed", shows
  nothing). Only a report dated beyond the skew is set aside as a clock error. And the
  loop drops aged-out values when a component mounts after the loop stopped, before its
  first render.
- Status `ok` with no entries means "no current count" (the view is empty, or kept values
  aged out while the last request succeeded); `unavailable` only follows a failure.
- `docs/data.md`: no edit here. The #102 branch rewrites its "Wait times" section, and an
  edit here would conflict with it; Phase 8 records what that section should gain.
- Review (finder 2, note): a reader that mounts within `refreshSeconds` of the last tick
  waits out the interval instead of asking again, so readers coming and going (the #104
  page, then a #105 card) keep to one request per interval. A tab returning to visible
  still asks at once, as the issue requires.
- City source, per the coordinator's message and the owner's correction on #103
  (2026-10-22, 14:27Z): the site key is `name` (was `facilityid`), and City reports come
  newest first (`orderByFields` on the report time). The report time stays
  `created_date_1740505041182`: the owner's correction keeps it, and on 2026-10-22
  `last_edited_date_1740505041182` matched it on every site. The query also asks for
  `comments` and `earlyvotingoperhours`, beyond the owner's field list, because the
  open-now gate and the dashboard's "poll closed" rule need them (neither holds contact
  data). The City unit was open (owner question on #102) and kept as one config value,
  `unit: 'people'`, following the City Board's own dashboard ("Estimated People in
  Line", item `8548fe3a065a455182181399909102ef`, re-read on 2026-10-22). The owner then
  decided people in line (coordinator message, 2026-10-22); the config comments say so.
- Review (finder 3): a reader mounting after the clock moved back asks at once instead of
  waiting out a negative elapsed time.
