# Plan: Content link check: www.sos.mo.gov sometimes stalls 60 s (issue #116)

Risk tier: Low. A scheduled maintenance script, never on the PR path and invisible to
voters; the retry logic takes an injected fetch, so unit tests with a fake fetch and short
timeouts exercise it fully. It alters existing retry behavior, which rounds up from trivial,
but the change is one function in one file.

Domain skills: superpowers:test-driven-development: invoke. Frontend, accessibility, React,
dataviz, Django, FastAPI, Expo: not applicable because no UI, API or data layer changes.

## Acceptance criteria

1. When a request times out and a retry remains, the last try waits longer
   (`lastTimeoutMs`, default 75000 ms) than the normal per-try timeout (15000 ms), so a page
   that stalls about 60 s before its first byte passes.
2. A failure that is not a timeout (connection error, 5xx, 429) keeps the normal timeout on
   every try; the long last try is only for a request that timed out on the try before.
3. Once a URL has failed after its long last try, later URLs on the same host get only the
   normal timeout, so a host that is really down does not cost 75 s per URL.
4. The timeout message names the timeout that try used (`no answer in 75000 ms`).
5. A single attempt (`attempts: 1`) still uses `timeoutMs`.
6. The workflow's comment and README describe the new worst case per URL.
7. Existing tests pass unchanged.

## Files that change

- `scripts/check-content-links.mjs`: `requestOnce` reports `timedOut`; `checkLinks` takes
  `lastTimeoutMs` and tracks hosts whose long try failed.
- `src/test/checkContentLinks.test.js`: new tests for criteria 1 to 5.
- `.github/workflows/data-health.yml`: comment on the content link step's timing.
- `README.md`: the content link check paragraph says a timed-out request gets a longer
  last try.

## Order of work

1. Tests for criteria 1 to 5 (red).
2. Implement in `checkLinks` and `requestOnce`.
3. Update the workflow comment and README.

## Risks

- Run time: one stalled URL now costs up to 15 + 2 + 15 + 4 + 75 = 111 s instead of 51 s.
  The 12-minute step limit holds for a few stalls; a whole host down costs one long try,
  then 51 s per URL as before (criterion 3). The step limit is not changed.
- Not chosen: spacing retries further apart, which slows every real failure too, and
  raising the per-try timeout for every try, which slows dead URLs by the same amount.

## Proof

- Criterion 1: a fake fetch that hangs on the first two tries and answers on the third,
  with `timeoutMs` 10 and `lastTimeoutMs` large enough, passes; with the old behavior it
  fails.
- Criterion 2: a fake fetch that throws on every try records each try's abort timing as
  the normal timeout (it is never given the long one).
- Criterion 3: two URLs on one hanging host: the second gets no long try.
- Criterion 4 and 5: the detail strings.
- Live drive: run `node scripts/check-content-links.mjs` against the real sites and record
  the summary.
