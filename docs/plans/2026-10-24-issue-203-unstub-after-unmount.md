# Plan: Other test files unstub fetch before unmounting, so a late request or retry can reach the next test (issue #203)

Risk tier: Medium. Test-only (no app code changes), but it is about async timing between
tests (real-timer retries, hook order) and touches teardown in about 36 test files.

Domain skills: superpowers:test-driven-development: invoke (a defect, so its test is
written red first). vercel-react-best-practices: not applicable because no component or
app code changes. Every other listed skill (django, fastapi, expo, dataviz, artifact
skills): not applicable because the change is Vitest teardown only.

## Acceptance criteria

1. One shared teardown helper, `src/test/teardown.js`, does what #186 put in
   `src/features/lookup/PrecinctPage.test.jsx`'s `afterEach`: unmount (`cleanup()`), let
   failures still being handled arm their retries (one real-timer tick), wait out
   `RETRY_DELAY_MS` (from `src/data/arcgis.js`) when the stubbed fetch gave an answer
   `query()` retries (a rejected fetch, a 5xx or a 429), and only then
   `vi.unstubAllGlobals()`.
2. Every test file under `src/` whose `afterEach` calls `vi.unstubAllGlobals()` (36 files
   today, list below) calls the helper in its place, so the page is unmounted before the
   globals are restored in every one of them, at file level and in nested `describe`s.
3. `src/features/lookup/PrecinctPage.test.jsx` uses the helper too; its local `retried`
   and the inline waits go. Its #186 reproduction (`between tests (#186)`) stays as it is
   and still passes.
4. A new reproduction test, `src/test/teardown.test.jsx`, fails on `main`'s pattern (plain
   `vi.unstubAllGlobals()` in `afterEach`) and passes with the helper, for both paths in
   the issue:
   - a transient failure whose retry is still waiting when the test ends gets no request
     to the next test's fetch stub;
   - a page is unmounted while the test's own stubs are still in place (its unmount sees
     the test's fetch, not the setup file's failing one).
5. ESLint forbids `vi.unstubAllGlobals()` in test files other than the helper, with a
   message naming the helper, so a new test file cannot reintroduce the gap.
6. No app behavior change: nothing outside `src/**/*.test.{js,jsx}`, `src/test/**` and
   `eslint.config.js` changes, and no test's assertions change. The full CI gate is green,
   and #202's fix (PR #222, `WaitTimesPage.electionDay107.test.jsx`) is untouched.

## Approach and what was not chosen

The helper, called explicitly from each file's `afterEach`, is the only place the order can
be fixed for every file:

- Not `src/test/setup.js` alone: its `afterEach` is registered before the test file's, and
  Vitest's default `sequence.hooks: 'stack'` runs after-hooks in reverse, so setup's
  `cleanup()` always runs after the file's unstub. Vitest has no setup-file hook that runs
  before a file's `afterEach` (`aroundEach`, `onTestFinished`, fixture cleanup and
  `beforeEach` teardown all run after it; checked in Vitest 5.0.5's runner).
- Not `sequence.hooks: 'list'`: it would put setup's hook first for file-level hooks only.
  A nested `describe`'s `afterEach` always runs before the file-level ones
  (`DistrictsCard.test.jsx`, `WaitTimesMap.test.jsx`, `hydrate.test.js` unstub there), and
  it would silently reverse the order of every other file's multiple hooks.
- Not wrapping `vi.unstubAllGlobals` in the setup file: it cannot be made async (the retry
  wait), and an unmount hidden inside a Vitest API would surprise the next reader.

The helper is applied to every file that unstubs, not only the ones counting fetch calls,
so the rule is one sentence ("tests unstub globals through the helper") that a lint rule
can enforce, and a later count assertion in any of them is already safe.

## Files that change

- New `src/test/teardown.js`: `export async function unmountThenUnstub()`. It keeps the
  real `setTimeout` captured when the module loads, so its waits work while a test has
  faked timers. When `setTimeout` is faked at teardown it skips both waits: a retry armed
  on the fake clock never fires, and waiting would only slow the file down (arcgis.test.js
  has many transient answers under fake timers). Date-only faking (`toFake: ['Date']`, as
  PrecinctPage uses) leaves `setTimeout` real, so the waits still run there. Comments
  carry #186's reasoning, moved from PrecinctPage.test.jsx.
- New `src/test/teardown.test.jsx`: the reproduction (criterion 4), in the style of
  PrecinctPage's `between tests (#186)`: ordered pairs of tests under one `afterEach` that
  calls the helper. Pair one: the first test starts a `query()` whose stubbed fetch
  rejects and ends before the retry; the second stubs a fresh fetch, waits
  `RETRY_DELAY_MS + 100` ms and expects no call. Pair two: a component whose unmount
  calls `fetch` records which fetch it reached; the next test expects it was that test's
  stub. Its red run is taken with the `afterEach` written the way the 35 files have it
  today (plain `vi.unstubAllGlobals()`, setup's `cleanup()` after it) and recorded under
  Proof before the helper exists; the committed file uses the helper.
- The 36 files' `afterEach` hooks: `vi.unstubAllGlobals()` becomes
  `await unmountThenUnstub()` and the hook becomes `async`. Other teardown lines in the same
  hook keep their place relative to it. Files:
  src/AppErrorBoundary.test.jsx, src/App.test.jsx, src/data/arcgis.test.js,
  src/data/cityArcgis.test.js, src/features/lookup/AddressLookup.analytics70.test.jsx,
  src/features/lookup/AddressLookup.errors18.test.jsx, src/features/lookup/AddressLookup.test.jsx,
  src/features/lookup/cardsAnalytics70.test.jsx, src/features/lookup/CityDistrictsCard.test.jsx,
  src/features/lookup/CityEarlyVotingCard.test.jsx, src/features/lookup/deviceLocation.test.js,
  src/features/lookup/DistrictsCard.test.jsx, src/features/lookup/locateCityLoader.test.js,
  src/features/lookup/locate.test.js, src/features/lookup/lookupPoint53.test.jsx,
  src/features/lookup/mapStyle.test.js, src/features/lookup/PollsCard.electionDay107.test.jsx,
  src/features/lookup/PollsCard.test.jsx, src/features/lookup/PrecinctMap.test.jsx,
  src/features/lookup/precinctMapView.test.js, src/features/lookup/PrecinctPage.analytics70.test.jsx,
  src/features/lookup/PrecinctPage.city89.test.jsx, src/features/lookup/PrecinctPage.errors18.test.jsx,
  src/features/lookup/PrecinctPage.test.jsx, src/features/lookup/retryFocus18.test.jsx,
  src/features/lookup/sharePrivacy.test.jsx, src/features/lookup/UseMyLocation.test.jsx,
  src/features/waitTimes/WaitTimesMap.test.jsx, src/features/waitTimes/WaitTimesPage.test.jsx,
  src/hydrate.test.js, src/i18n/switchApp.test.jsx, src/pageHeadApp.test.jsx,
  src/test/a11yPages.test.jsx, src/test/addressPrivacy.test.jsx,
  src/test/analyticsPrivacy.test.jsx, src/waitTimesFallback.test.jsx.
- `eslint.config.js`: a `no-restricted-properties` rule for `vi.unstubAllGlobals` on
  `src/**/*.test.{js,jsx}` and `src/test/**`, ignoring `src/test/teardown.js`.
- `src/test/setup.js`: its comment says files that stub globals tear down through the
  helper; its own `cleanup()` stays for files that stub nothing.
- `README.md` or `docs/`: only if a line there describes test teardown (none found by grep
  today; Phase 8 checks again).

## Order of work

1. Write `src/test/teardown.test.jsx` against a plain-unstub `afterEach`, run it, confirm
   it fails for the expected reasons (the later test's stub gets the retry; the unmount
   sees the setup file's fetch). Record the output under Proof.
2. Write `src/test/teardown.js`, switch the reproduction to it, commit the test and helper
   (the reproduction is frozen from here; `.claude/fix-lock` lists it).
3. Convert PrecinctPage.test.jsx, run it alone, then the other 35 files, one mechanical
   pass; run `npm test`.
4. Add the lint rule; `npm run lint`.
5. Full gate.

## Risks

- A file with fake timers still on at teardown: handled by the captured real `setTimeout`
  and the skip when `setTimeout` is faked. Riskiest step: if any file's tests depend on a
  retry still firing after the test, the skip or wait could change what it sees; the full
  suite run shows it.
- Moving the unmount earlier puts it before other teardown in the same hook when that line
  comes first today (for example `tracked.stop()` then unstub keeps its order, but
  `errors.mockRestore()` in AppErrorBoundary now runs after the unmount, since the helper
  is placed where the unstub was). Placing the helper where the unstub was keeps every
  other line's order; only the unmount moves earlier, which is the fix.
- Node-environment files (smoke, build) do not unstub and are not touched.
- Suite time: the 500 ms wait runs only in tests with a transient answer on real timers.
  Measure before and after; flag it if the suite grows by more than a few seconds.
- Flakiness proof is statistical: besides the deterministic reproduction, run the full
  suite repeatedly (20 runs) to show no new failures.

## Proof

- Criterion 4: `src/test/teardown.test.jsx` red output on the plain-unstub pattern
  (recorded here before the fix), green with the helper.
- Criteria 1 to 3: the diff, PrecinctPage's `between tests (#186)` still green, and a grep
  showing `vi.unstubAllGlobals` only in `src/test/teardown.js`.
- Criterion 5: `npm run lint` green, and a scratch line calling `vi.unstubAllGlobals()` in a
  test file makes it fail (shown, then removed).
- Criterion 6: `git diff --stat` limited to test files and `eslint.config.js`; full gate
  (`npm run lint`, `npm run format:check`, `npm test`, `npm run build`, `npm run test:e2e`,
  `npm run test:perf`) green; 20 repeated `npm test` runs with no failures; suite duration
  before and after.
- Live drive: none needed beyond the gate, since no app behavior changes; the e2e and perf
  gates run against the build as a check that nothing in the app moved.
