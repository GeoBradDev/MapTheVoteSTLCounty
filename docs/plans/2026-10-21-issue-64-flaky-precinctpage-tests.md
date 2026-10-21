# Plan: Flaky PrecinctPage tests in full unit runs (issue #64)

Risk tier: Low. Test-only change in one file; no app code, API, or behavior changes.

Domain skills: superpowers:test-driven-development, invoke (applied as "prove the race before
fixing the wait"); vercel-react-best-practices, not applicable because no React app code changes.

## Acceptance criteria

1. The waits in `src/features/lookup/PrecinctPage.test.jsx` no longer depend on the machine being
   idle: no wait gives up before the page has had a fair chance to render under load.
2. No test in the file asserts on an element it found before the state under test reached it. In
   particular, a test that checks an error message waits for the message, not for the always
   present, empty `role="alert"` paragraph.
3. No test is skipped, deleted, or weakened: each still asserts what it asserted before.
4. The full gate passes: lint, format check, unit tests, build, e2e, perf.

## Findings

- 90 sequential full runs on an idle 24-core machine, 90 runs three at a time, 36 runs pinned to
  one or two cores: no PrecinctPage failure. The two named tests did not reproduce.
- Under heavy load (8 full runs at once, load average about 200), "says a malformed code is not
  found" failed: `findByRole('alert')` resolved on `PrecinctPage`'s `<p role="alert">`, which is
  always in the page and empty until a load fails, and `toHaveTextContent` then saw `""`.
- A scratch test that delays the precinct response by 2 s shows the same thing on an idle machine:
  `await screen.findByRole('alert')` returns the empty alert. The tests at lines 384, 465, 472 and
  479 use this pattern.
- One `getByRole` query on this page costs about 200 ms in jsdom on an idle machine (role and
  visibility checks over the whole tree). The default `findBy` timeout is 1000 ms, and Testing
  Library reports a timeout without a final check, so a few slow checks under load are enough to
  fail a wait whose element is about to appear. That fits the issue's numbers (about 3 in 72 runs
  on a loaded machine, never alone) for "moves focus to the results heading" (waits on
  `ready()`) and "titles a code that is not found as not found" (waits on
  `findByRole('region', { name })`).

## Files that change

- `src/features/lookup/PrecinctPage.test.jsx` only.

## Order of work

1. Add an `alertSaying(text)` helper that waits until exactly one `role="alert"` holds `text`, and
   returns it. It picks by text because the address search shown for "not found" brings more,
   empty, alerts (found while proving the helper: a plain `getByRole('alert')` then throws
   "multiple elements"). Use it in the four tests that today do `findByRole('alert')` then
   `toHaveTextContent`.
2. Give the file's waits headroom: `configure({ asyncUtilTimeout: 4000 })` from
   `@testing-library/react` in `beforeAll`, restored in `afterAll`, with a comment on why. 4000 ms
   stays under Vitest's 5000 ms test timeout, so a real hang still fails as a timeout with the
   query's message.
3. Run the gate.

## Risks

- A longer wait makes a genuinely broken test slower to fail (up to 4 s per wait). Accepted: only
  on failure.
- `configure` is module state in `@testing-library/dom`; restoring it in `afterAll` keeps other
  files on the default even if a worker reuses the module.

Not done: raising the timeout globally in `src/test/setup.js` (would hide slow waits elsewhere and
is outside this issue), or changing app markup to drop the always present alert (it exists so a
screen reader announces later text, per #18).

## Proof

- Criterion 2: a scratch test (not committed) with the precinct response delayed 2 s: the old
  pattern fails (`findByRole('alert')` returns the empty alert), `alertSaying` passes after about
  2 s. With no delay both pass. The old pattern only passed because the message landed during
  Testing Library's post-wait `setTimeout(0)` drain, which loses the race to a busy event loop.
- Criterion 1: the full suite repeated under load (several runs at once) with no PrecinctPage
  failure, compared with the stress run on main that failed.
- Criterion 3: the diff shows only wait changes; the test count is unchanged.
- Criterion 4: the gate output.
- Live drive: skipped; the change is test-only and the automated gate fully covers it.
