# Plan: scripts/check-geocoder.mjs reports every City address as stl-city: locate() cannot load cityChunk.js (JSX) under Node (issue #198)

Risk tier: High (forced). The changed script is a step of the scheduled data health workflow
(`.github/workflows/data-health.yml`, which failed as #204), and the skill forces High for a
change that touches a scheduled job. Without that rule it would be Low: the workflow file, its
schedule and its issue-opening step do not change, the app's behavior does not change (a new
optional argument whose default is today's loader), and two files of code plus tests change.

Domain skills:
- superpowers:test-driven-development: invoke.
- vercel-react-best-practices: not applicable because no React component, hook or bundle split
  changes; `src/cityChunk.js` and the app's lazy load stay as they are (#147).
- frontend-design, chrome-devtools-mcp:*, dataviz: not applicable because nothing visible changes.
- django, django-ninja-api, python-fastapi, expo:*: not applicable because the repo is a Vite
  React frontend with no backend.

## Acceptance criteria

1. Run with plain `node scripts/check-geocoder.mjs`, every City address in `CITY` and every City
   pick is resolved by the City's live precinct layer and reported as `city <code>` (for example
   `city W05P05` for 5010 Nottingham Ave 63109, `city W10P02` for 6135 Washington Ave 63112),
   for both the app chain and the live-blocked chain; none is reported as `stl-city` while the
   City layer answers.
2. If the City's data code cannot be loaded under plain Node, the script fails at start with
   the load error, never by silently reporting City addresses as `stl-city`.
3. A real City precinct regression is still caught: when the City layer answers no precinct
   or fails, `locate()` still answers `stl-city` and the script still reports
   `stl-city, want a City precinct` and exits 1 (behavior of `locate()` and the script's
   checks unchanged).
4. The app is unchanged: `locate(place)` with no second argument loads the City client through
   `loadCityClient()` (`src/cityChunk.js`) exactly as today, so the City code stays out of the
   first load (#147).
5. A test fails if any module `scripts/check-geocoder.mjs` imports from `src/` cannot be loaded
   by plain Node (for example because it, or a module it imports, pulls in a `.jsx` file).

## Files that change

- `src/features/lookup/locate.js`: `locate(place, { loadCity = loadCityClient } = {})`; the
  inner `cityPrecinct()` calls `loadCity()` instead of `loadCityClient()`. JSDoc names the
  option: a function that resolves to an object with `getCityPrecinctAtPoint`, for callers
  outside the browser build (the script, #198).
- `src/features/lookup/locate.test.js`: the frozen red test for the option (below).
- `src/features/lookup/locateCityLoader.test.js` (new): the failing-loader and no-precinct
  tests for the option. Revised during Phase 4: they were first planned in `locate.test.js`, but
  that file is frozen once the red test is committed, so they live in their own file.
- `scripts/check-geocoder.mjs`: `import * as cityClient from '../src/data/cityArcgis.js'`
  (a static import, so a load failure stops the script at start, criterion 2) and
  `locate(place, { loadCity: async () => cityClient })` in `kindOf()`, with a comment naming
  #198 and why (the City chunk re-exports `.jsx` components plain Node cannot load).
- `src/test/scriptsPlainNode.test.js` (new): reads the static `from '../src/...'` imports of
  `scripts/check-geocoder.mjs`, then imports each with plain `node` (`execFileSync`, as
  `src/test/checkConfig.test.js` does) and expects success.
- Docs, Phase 8: `README.md`'s address search check paragraph and `docs/data.md` only if a
  sentence there becomes wrong; a `docs/data.md` Geocoding entry recording the live run's
  result if that section records each run (it does for earlier runs).

## Order of work

1. Red: add the `locate.test.js` test "asks the given City loader, not the City chunk": a place
   the geocoder names as the City, `loadCity` a stub resolving to
   `{ getCityPrecinctAtPoint: vi.fn(async () => ({ code: 'W99P99' })) }`; expect
   `{ kind: 'precinct', jurisdiction: 'city', precinct: { code: 'W99P99' } }`, the stub called
   once with the point, and no request to the City precinct layer. Run it, confirm it fails
   because the option is ignored (the recorded City precinct comes back). Commit it alone; add
   its path to `.claude/fix-lock`.
2. Green: the `locate.js` change. Then add (not frozen, already green with the change), in
   `locateCityLoader.test.js`, the tests "a City loader that fails answers stl-city" (stub
   rejects) and "the loaded City code finds nothing answers stl-city", so criterion 3 holds
   through the option.
3. The script change.
4. The plain Node test (criterion 5). Confirm it would catch the defect class: temporarily
   point it at a module that imports `src/cityChunk.js` and see it fail, then revert (record
   the output under Proof).
5. `rm .claude/fix-lock`. Full gate. Live run of `node scripts/check-geocoder.mjs`.

## Risks

- The script now resolves City precincts with `src/data/cityArcgis.js` directly, not through
  the chunk the browser loads. They are the same functions (the chunk is `export *` of that
  module), so the check still covers the app's City lookup code; only the chunk wiring (the
  dynamic import) is not exercised by the script, and the e2e tests and unit tests cover that.
- Riskiest step: the plain Node test. It spawns `node` per import; keep it to one spawn that
  imports all of them, and use `process.execPath` so it uses the same Node as the test run.
- Not chosen: running the script with vite-node. It is not a dependency, it would change the
  workflow file and the README's commands, and it adds an install for a hand-run script. Not
  chosen: moving the JSX out of `src/cityChunk.js`, which reverses the #147 owner decision on
  chunking.
- Live run depends on public Photon and the County and City layers; a service outage is
  outside this issue and is reported as such.

## Proof

- Criteria 1 and 3: the live `node scripts/check-geocoder.mjs` run after the change (output
  recorded in the PR), compared with the baseline run on `main` that reported every City
  address as `stl-city`.
- Criterion 2: the static import; shown by temporarily changing it to `../src/cityChunk.js` and
  seeing the script stop with `Unknown file extension ".jsx"`, then reverting.
- Criterion 3 (unit): existing `locate.test.js` City-failure tests and the new failing-loader test.
- Criterion 4: the existing `locate.test.js` tests, which call `locate(place)` with one
  argument and see the City layer requested through the default loader; plus the e2e gate.
- Criterion 5: `src/test/scriptsPlainNode.test.js`, and its temporary red run.
- No live drive of the browser app: no user-facing change.

### Recorded during Phase 4

- Frozen red test (commit 74c4686), before the `locate.js` change: `× asks the given City
  loader, not the City chunk`, `- "code": "W99P99"` / `+ "code": "W14P02"`: the option was
  ignored and the recorded City precinct came back.
- Temporary swap of the script's import to `../src/cityChunk.js`: both
  `src/test/scriptsPlainNode.test.js` tests failed (`TypeError [ERR_UNKNOWN_FILE_EXTENSION]:
  Unknown file extension ".jsx" for .../src/features/lookup/CityDistrictsCard.jsx`), and
  `node scripts/check-geocoder.mjs` stopped at start with `ERR_UNKNOWN_FILE_EXTENSION`.
  Reverted.
