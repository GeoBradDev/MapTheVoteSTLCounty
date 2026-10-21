# Plan: Election config file: layer URLs, dates, and election-specific values (issue #4)

Risk tier: Low. Not a forced-High area. Adds one data-only module and its tests; nothing reads
it yet, and unit tests can check every value and rule in it. No tier raise applies (no
stateful UI, no changed contract, adds rather than alters, two new files plus docs).

Domain skills:
- vercel-react-best-practices: not applicable because no React code changes.
- frontend-design: not applicable because there is no UI in this change.
- context7 (docs lookup): not applicable because no new library API is used; the tests use the
  same vitest globals and node:fs calls as the existing tests.
- expo, django, django-ninja, fastapi, dataviz, claude-api: not applicable because none of
  those stacks or outputs are involved.

Mode: no-commit. The repo has no `CLAUDE.md` or `AGENTS.md` granting a git exception, so every
file is left uncommitted and the run stops before Phase 9.

Scope decisions (made in Phase 1 from the recorded issue #1 decisions):
- Election Day hours are no longer `TODO`. Issue #1 recorded them on 2026-10-20 with sources:
  6:00 a.m. to 7:00 p.m., anyone in line at 7:00 p.m. may vote (RSMo 115.407 and the county
  FAQ). They go in the config with both source links and `lastVerified: '2026-10-20'`.
- Early voting dates and hours go in this config, as the issue says. `docs/data.md` still says
  they live in content files, so Phase 8 corrects it.
- Both schedules carry `sources` (an array) rather than the issue's singular `source`, so early
  voting and Election Day hours share one shape even though Election Day has two sources.
- `nearbyPollCount` is 3, the low end of the 3 to 5 range decided in issue #1. It is one
  number to change.
- `scripts/inspect-data.mjs` hardcodes this election's service names on purpose: it is the
  discovery tool that finds them before the config exists. It, `docs/` and `content/` are
  outside the "not hardcoded elsewhere" rule. The rule is enforced on `src/` and `index.html`.

## Acceptance criteria

1. `src/config/election.js` default-exports one deeply frozen object: every nested plain object
   and array is frozen. The RegExp is left unfrozen so `test` and `exec` behave normally.
2. It holds these values, taken from `docs/data.md` and the issue:
   - `electionDate: '2026-11-03'` and `electionName: 'November 3, 2026 General Election'`
   - `timeZone: 'America/Chicago'`, the zone every `HH:MM` time in the file is in
   - `serviceRoot: 'https://services6.arcgis.com/wkbq75VVf2MvUvs7/ArcGIS/rest/services'`
   - `layers.precincts: 'precincts_2026_11_view/FeatureServer/1'`,
     `layers.polls: 'polls_2026_11_view/FeatureServer/1'`,
     `layers.countyBoundary: 'St_Louis_County_Boundary/FeatureServer/0'`
   - `absenteeWhere: "abs_type IN ('abs','boe')"`
   - `sampleBallotUrlPattern`: an anchored, non-global RegExp for portal item `/data` URLs on
     `stlouiscovotes.maps.arcgis.com` with a 32 hex character item ID. It accepts the sample
     ballot link recorded in `docs/data.md` and rejects another host, a non-hex or wrong length
     ID, and a URL with anything after `/data`.
   - `congressionalField: 'congressional_district_25'`
   - `officialLookupUrl`: the county's November 2026 sample ballot Instant App,
     `https://stlouiscovotes.maps.arcgis.com/apps/instant/lookup/index.html?appid=4c3116b104af40bea77ebea20aaae275`
   - `nearbyPollCount: 3`, an integer from 3 to 5
3. `earlyVoting` has `sources` (the county Absentee Voting Lookup app,
   `https://stlouiscovotes.maps.arcgis.com/apps/instant/nearby/index.html?appid=9301b4594bef4d9c9271778e4648179d`),
   `lastVerified: '2026-10-20'`, and `schedules` keyed by the polls layer's `abs_type`:
   - `boe`: weekdays 2026-09-22 to 2026-10-30, 08:00 to 16:30; Saturdays 2026-10-24 and
     2026-10-31, 09:00 to 13:00; 2026-11-02, 08:00 to 17:00
   - `abs`: weekdays 2026-10-20 to 2026-10-30, 08:00 to 16:30; Saturdays 2026-10-24 and
     2026-10-31, 09:00 to 13:00; 2026-11-02, 08:00 to 17:00

   Each entry is `{ from, to, days, open, close }`, where `days` is `'weekdays'` or `'daily'`
   and a single day has `from === to`. Every date is before `electionDate`, `from <= to`,
   `open < close`, a weekdays range starts and ends on a weekday, and no date falls in two
   entries of the same schedule.
4. `electionDayHours` is `{ open: '06:00', close: '19:00', inLineAtCloseMayVote: true,
   sources: [RSMo 115.407, county FAQ], lastVerified: '2026-10-20' }`.
5. A JSDoc typedef describes the config shape, and the exported object is annotated with it.
6. A unit test lists every required key path and fails when any is missing.
7. No layer name, service name, date, URL, field name or where clause from the config appears
   in any other file under `src/` (any extension) or in `index.html`. A test enforces this, so
   the next election is a config change. `lastVerified` dates are not collected, nor are
   `sources` links, which cite the county site and statutes that other pages may link too.
   The exception is a source link to a portal item or app made for this election (it carries a
   32 hex character ID, like the Absentee app's `appid`), which is collected.
8. The full gate passes: `npm run lint`, `npm run format:check`, `npm test`, `npm run build`.

## Files that change

- `src/config/election.js` (new): typedef, `deepFreeze` helper, the config object.
- `src/config/election.test.js` (new): required keys, frozen, value formats, schedule rules,
  sample ballot pattern.
- `src/test/election-hardcoding.test.js` (new): scans `src/` and `index.html` for the config's
  election-specific strings.
- `docs/data.md`: Phase 8. Point the "Config values" section at `src/config/election.js`, drop
  the "content files" line, and replace the Election Day hours TODO with where they now live.
- `README.md`: Phase 8, a short "Election config" section: election-specific values live in
  `src/config/election.js`, what the hardcoding test checks and does not (hours), and that
  `content/` may repeat them.

## Order of work

1. Write `src/config/election.test.js` and `src/test/election-hardcoding.test.js`. Run them:
   red, because `src/config/election.js` does not exist.
2. Write `src/config/election.js`. Run the tests: green.
3. Mutation checks by hand, then revert: delete one required key, break one schedule date
   (overlap, weekend start), and paste a config URL into `src/App.jsx`. Each must turn a test
   red. Record the output under Proof.
4. Full gate.

## Risks

- A wrong date or hour misleads voters once a screen reads it. Mitigation: values copied from
  the live county app config fetched on 2026-10-20 and from issue #1's recorded decision; the
  schedule tests catch impossible combinations (weekend start on a weekdays range, overlaps,
  dates after the election).
- The hardcoding test could flag a legitimate generic string. Mitigation: it only collects
  URLs, ISO dates, layer paths and their service names, the field and where strings, the
  election name and the sample ballot pattern's source, not
  times or `days` values. `America/Chicago` is not collected, nor `lastVerified`, nor a
  `sources` link without a portal item ID. A generic date that happens to equal a schedule date (today `2026-10-20` is
  both `lastVerified` and the satellite sites' first day) is still flagged; accepted as rare.
- The hardcoding test could miss a reconstructed value (for example the host written
  separately from the path). Accepted: it guards the common mistake, copying a literal; code
  review covers the rest.
- Freezing a RegExp makes `lastIndex` read-only, which breaks a global or sticky RegExp.
  Mitigation: `deepFreeze` skips RegExp, and a test asserts the pattern is neither global nor
  sticky.

Chosen not to do: a `layerUrl()` helper or any data-access code (that is the data layer's
issue), contact details and official website links (not election-specific), and refactoring
`scripts/inspect-data.mjs` to read the config (see Scope decisions).

## Proof

- AC1: `election.test.js` "is deeply frozen" walks every nested object and array.
- AC2: `election.test.js` format checks (ISO date, `https://` URLs, `<service>/FeatureServer/<id>`
  paths, integer range) and the sample ballot pattern cases, including the link from
  `docs/data.md`. The exact values are checked by reading the diff against this plan in
  Phases 5 and 7, not by restating them in a test (which would itself hardcode them).
- AC3: `election.test.js` schedule rules, and review of the values against the county app text.
- AC4: `election.test.js` Election Day hours shape; values reviewed against issue #1.
- AC5: read in review; lint passes.
- AC6: `election.test.js` "has every required key", plus mutation check 3.
- AC7: `election-hardcoding.test.js`, plus mutation check 3.
- AC8: gate output in Phase 6.
- Live drive: skipped. Nothing renders or fetches with the config yet, so the automated gate
  covers the change fully.

### Recorded during Phase 4 (2026-10-20)

Red before the config existed: both new test files failed with
`Cannot find module '../config/election.js'` (`Test Files 2 failed (2)`).

Green after: `Test Files 2 passed (2), Tests 22 passed (22)`.

Mutation checks, each applied alone and reverted:

| Mutation | Test that turned red |
| --- | --- |
| Delete `nearbyPollCount` | has every required key; shows 3 to 5 nearby polling places |
| Move a `boe` Saturday to Friday 2026-10-23 (inside the weekdays range) | lists each date at most once per schedule |
| Start the `abs` weekdays range on Sunday 2026-10-18 | starts and ends weekday ranges on weekdays |
| Move a `boe` date to 2026-11-04 | ends before Election Day |
| `deepFreeze` returns without freezing | is deeply frozen, except the RegExp |
| Add `'polls_2026_11_view'` to `src/App.jsx` | appear only in the election config |

### Recorded during Phase 5 (2026-10-20)

Finder 1 found that the hardcoding test collected source links and `lastVerified` dates, so a
future page linking the county FAQ would fail it, and that it scanned only six extensions
although AC7 says any file under `src/`. Two tests reproduced it, red before the fix:

- "ignores source links and verification dates": `expected [ …(22) ] to not include
  'https://stlouiscovotes.maps.arcgis.co…'`
- "scans every file under src, whatever its extension": `expected [ …(20) ] to include
  '…/src/components/.gitkeep'`

After the fix both pass (`Tests 24 passed (24)` across both new files). The first test was then
moved onto a fixture config, because the real `lastVerified` date equals a schedule date and so
is collected for that reason. With the exclusion set emptied it turns red again.

Finder 2 found two problems in that fix. First, skipping every `sources` link also exempted the
Absentee app link, a per-election portal app. Red before the fix: "still collects a source
link to a portal item made for this election", `expected [] to deeply equal [ Array(1) ]`.
Now a `sources` link is collected when it carries a 32 hex character ID. Second, the
file-walk test depended on the placeholder `src/components/.gitkeep` existing. It now builds
a temporary fixture directory with a dotfile and a nested `.svg`. After both:
`Tests 25 passed (25)`.

Deviation: these tests were not added to `.claude/fix-lock`. The defect is in the scan helper
in the same test file, so freezing that file would block the fix itself.
