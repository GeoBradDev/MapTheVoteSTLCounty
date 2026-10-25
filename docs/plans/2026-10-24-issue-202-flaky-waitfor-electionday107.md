# Plan: Flaky waitFor timeout in WaitTimesPage.electionDay107.test.jsx under load (issue #202)

Risk tier: Medium. Test-only change in one file, no app code, but it is about how a test waits
on async work (raised one tier for async, as #186 was). No app, API or behavior change.

Domain skills: superpowers:systematic-debugging, invoke (root cause before the fix);
superpowers:test-driven-development, invoke (the failing load run is the red proof);
vercel-react-best-practices, not applicable because no React app code changes; frontend-design
and the a11y skills, not applicable because nothing a voter sees changes.

## Acceptance criteria

1. "lists every polling place of both boards, not the early voting sites" passes under load:
   0 failures in 15 full `npm test` runs made three at a time (5 rounds of 3), versus the
   failures measured on `main` below.
2. Its wait is deterministic: no `waitFor` or `findBy*` poll decides when the list is counted.
   It is counted once, after the loaders' answers have been rendered.
3. No test is skipped, deleted or weakened, and no timeout is raised: every test in the file
   still asserts what it asserted before (only how it waits changes).
4. 15 sequential full `npm test` runs still pass.
5. The full gate passes: lint, format check, unit tests, build, e2e, perf.

## Findings

- Before, measured here on `main` at c6ded2b (24 cores): 8 of 15 full runs failed in 5 rounds of
  three suites at once, every failure this test, `Timed out in waitFor` at line 104. The test
  then took 2.2 to 3.1 s; the file 6.6 to 9.9 s.
- The failure's DOM dump shows the list already rendered (no skeleton, one `<ol>`), so the
  loaders answered; the wait ran out while counting.
- Mechanism: `waitFor` (Testing Library's default 1000 ms timeout) never starts a new check while
  an async check is pending. The one check is `items()`: `findByRole('list', { name })` (itself a
  poll with its own 1000 ms) then `getAllByRole('listitem')` over the 256 rows (200 County and
  56 City, each with nested headings, paragraphs and links). Idle, that first check took 185 ms,
  most of it waiting for React to render 256 rows twice (StrictMode, development build), then
  26 ms for the role query. It is the file's first test, so it also pays the cold start. Under a
  roughly tenfold slowdown the single check outlasts 1000 ms and the outer wait times out with
  the list on screen. The role queries cost per poll, but the main cost is that the timed wait
  spans the render of 256 rows.
- Probe (a throwaway copy of the test, deleted): with
  `await act(() => new Promise((resolve) => setTimeout(resolve, 0)))` after `render`, the list
  holds all 256 items when queried once, synchronously (the flush took 111 ms, the query 75 ms,
  idle). The loaders are `vi.fn(async () => ...)`, so both boards' parts settle in microtasks,
  before one macrotask; `act` then flushes React's render before it returns. Only `Date` is
  faked, so `setTimeout` is real.

## Files that change

- `src/features/waitTimes/WaitTimesPage.electionDay107.test.jsx` only.

## Order of work

1. Red is the measurement above (this is a timing flake, not a logic defect, so no new test
   reproduces it deterministically; the before numbers are the proof, as the issue asks).
2. In the test file: add `act` to the Testing Library import and a helper, `loaded()`, that awaits
   `act(() => new Promise((resolve) => setTimeout(resolve, 0)))`, with a comment saying why (the
   loaders answer in microtasks; one macrotask inside `act` renders both boards' rows, so the list
   is counted once instead of polled; see #202).
3. Change `items()` to `await loaded()` and then query synchronously:
   `within(screen.getByRole('list', { name: copy.electionDay.listLabel })).getAllByRole('listitem')`.
   Tests 3 to 5, which use `items()` through `findByRole` today, get the same deterministic wait.
4. In the failing test, replace the `waitFor` around `items()` with
   `expect(await items()).toHaveLength(polls.features.length + cityPolls.features.length)`.
   Same assertion, one count.
5. Run the file, then the load measurement again (5 rounds of 3 full runs), then 15 sequential
   full runs, then the full gate.

## Risks

- If the page ever loads its rows through a timer or a lazy chunk instead of the props' loaders,
  one macrotask may not be enough and the test fails at once (not after a timeout), naming the
  short list. That is a clear failure, not a flake; the comment says what the flush assumes.
- Tests 3 to 5 now always see both boards' rows before reading the first row; before, they may
  have read a County-only list. Their assertions (Election Day hours and status, no absentee
  kind, no count) hold for any polling place, so they are unchanged.
- Not done: test 2's `waitFor` on the line count text (`getAllByText(COUNT_TEXT)`), which waits on
  the line count store's loop, not the list, and has not failed in the measurements. Left as is
  and noted in the PR; changing it is outside this issue. Issue #203 (fetch unstub ordering) is
  the next issue and not touched here.
- Not done: raising the timeout, or skipping, or replacing the role query with a CSS selector
  (that would change what the test asserts).

## Proof

- Criteria 1 and 2: the load measurement after the fix (5 rounds of 3 full runs), versus 8 of 15
  failures before; the diff shows no `waitFor` or `findBy*` around the count.
- Criterion 3: the diff changes only the wait helper, the import and the one `waitFor`; every
  `expect` is unchanged.
- Criterion 4: 15 sequential full runs after the fix.
- Criterion 5: the full gate output.
- Live drive: not applicable, the app does not change; the full gate covers the build.
