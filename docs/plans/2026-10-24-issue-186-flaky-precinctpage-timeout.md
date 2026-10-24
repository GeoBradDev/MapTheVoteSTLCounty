# Plan: Flaky timeout in PrecinctPage.test.jsx in full unit runs (issue #186)

Risk tier: Medium. Test-only change in one file, but it is about async timing between tests
(raised one tier for async). No app code, API or behavior changes.

Domain skills: superpowers:systematic-debugging, invoke (root cause before any fix);
superpowers:test-driven-development, invoke (a red reproduction first); vercel-react-best-practices,
not applicable because no React app code changes; frontend-design and a11y skills, not applicable
because nothing a voter sees changes.

## Acceptance criteria

1. No request started by one test in `src/features/lookup/PrecinctPage.test.jsx` reaches a later
   test's `fetch` stub.
2. A deterministic test fails on `main` for that reason and passes after the fix.
3. No test is skipped, deleted or weakened, and no timeout is raised: each still asserts what it
   asserted before.
4. 10 or more full `npm test` runs in a row pass after the fix.
5. The full gate passes: lint, format check, unit tests, build, e2e, perf.

## Findings

- 15 full runs on `main` (24 cores, idle): 1 failure, in PrecinctPage.test.jsx, "treats W1P12 as
  malformed": `expect(fetchMock).not.toHaveBeenCalled()` saw 2 calls, to the County line count
  layer and the City wait layer, the shared early voting wait loop's two requests. With a stack
  logged for every County wait request, a later loop of runs failed the same way in "never turns
  non-ASCII letters in %C3%9Fc007 into another precinct code". The stack ran from a timer through
  `query()`'s retry (`src/data/arcgis.js`, `await new Promise(... RETRY_DELAY_MS)` then
  `fetchOnce`), not from any component in that test.
- Mechanism: a test whose early voting wait request fails transiently (a 5xx, or a rejected
  fetch, like `answerNoCityRows` gives every layer but the City's) leaves `query()`'s 500 ms retry
  timer armed after the test ends. Unmounting stops the loop's next tick but not a retry already
  waiting. Most tests in the file take under 100 ms, so the retry fires a few tests later and
  calls the global `fetch`, which by then is that test's fresh `fetchMock`. A test that asserts no
  request, or counts requests, then fails. A wait on a request count that the extra call keeps
  from matching runs to the 4000 ms wait timeout, and with the test's earlier waits that can pass
  Vitest's 5000 ms test timeout: the timeout the issue reports. (Not reproduced here as a timeout;
  the extra call is the one cause seen in about 75 runs.)
- Why it is new: the wait loops run only while an early voting site is open. Tests that do not fake
  the date run at the real time, and early voting is now open, so since #184 and #105 these loops
  run in full test runs during opening hours.

## Files that change

- `src/features/lookup/PrecinctPage.test.jsx` only.

## Order of work

1. Red: add a pair of tests, in order, under `describe('between tests (#186)')`. The first renders
   CC007 at a time early voting is open, with the wait layers answering 500, and ends once the
   page is ready. The second renders a malformed code, waits past `RETRY_DELAY_MS` and expects no
   request. Confirm the second fails with the wait layers' retry calls. Commit it alone.
2. Fix: in the file's `afterEach`, unmount first (Testing Library's `cleanup`), then, if any of
   this test's answers was one `query()` retries (a rejected fetch, or a status of 500 and up or
   429), wait `RETRY_DELAY_MS` on a real timer before unstubbing `fetch`. The retry's timer was
   armed before the hook ran (the failure was handled in microtasks), and Node fires timers of
   equal delay in the order they were armed, so the retry calls this test's own stub before the
   next test starts. Tests with no such answer wait for nothing.
3. Run the file, then 10+ full runs.

## Risks

- The wait adds 500 ms to each test that had a transient answer (a handful). Acceptable.
- Order-dependent pair of tests: Vitest runs a file's tests in order (no `sequence.shuffle` in
  `vite.config.js`). The comment says so.
- What I chose not to do: change `useWaitTimes` or `query()` to abort a retry once the last reader
  leaves. A reader that comes back inside the interval would then wait up to 30 s for its first
  count, a behavior change in election week for a test isolation bug.

## Proof

- Criterion 1 and 2: the new pair of tests; red on `main`, green after.
- Criterion 3: the diff touches only `afterEach` and adds tests.
- Criterion 4: 10+ full `npm test` runs after the fix, all passing, versus 1 failure in 15 before
  and 1 in 3 instrumented runs.
- Live drive: not applicable, the app does not change; the full gate covers the build.
