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
2. The long last try is only for a request whose try before the last timed out; when that
   try failed some other way (connection error, 5xx, 429), the last try keeps the normal
   timeout.
3. At most `maxLongTries` (default 3) URLs in one run get the long last try; later ones
   get only the normal timeout, so a site that stalls on every page adds at most about
   3 minutes. (Revised after review: the first version marked a host down only when its long
   try timed out, which a gateway error at 60 s or a host-wide stall that still answers
   would get past, costing about 96 s per URL.) The content link step's limit goes from 12
   to 15 minutes, and the job's from 70 to 73, to hold that extra 3 minutes.
4. The timeout message names the timeout that try used (`no answer in 75000 ms`).
5. A single attempt (`attempts: 1`) still uses `timeoutMs`.
6. The workflow's comment and README describe the new worst case per URL.
7. Existing tests pass unchanged.

## Files that change

- `scripts/check-content-links.mjs`: `requestOnce` reports `timedOut`; `checkLinks` takes
  `lastTimeoutMs` and `maxLongTries`.
- `src/test/checkContentLinks.test.js`: new tests for criteria 1 to 5.
- `.github/workflows/data-health.yml`: comment on the content link step's timing; its
  step limit 12 to 15 minutes and the job limit 70 to 73.
- `README.md`: the content link check paragraph says a timed-out request gets a longer
  last try.

## Order of work

1. Tests for criteria 1 to 5 (red).
2. Implement in `checkLinks` and `requestOnce`.
3. Update the workflow comment and README.

## Risks

- Run time: one stalled URL now costs up to 15 + 2 + 15 + 4 + 75 = 111 s instead of 51 s.
  The cap of 3 long tries bounds the extra time at about 3 minutes per run (criterion 3),
  and the step limit rises by that much.
- Not chosen: spacing retries further apart, which slows every real failure too, and
  raising the per-try timeout for every try, which slows dead URLs by the same amount.

## Proof

- Criterion 1: a fake fetch that hangs on the first two tries and answers on the third,
  with `timeoutMs` 10 and `lastTimeoutMs` large enough, passes; with the old behavior it
  fails.
- Criterion 2: a connection error, a 503 or a 429 on the try before, then a hang: the
  last try's detail names the normal timeout.
- Criterion 3: three hanging URLs with `maxLongTries` 2: the third gets no long try.
- Criterion 4 and 5: the detail strings.
- Live drive: run `node scripts/check-content-links.mjs` against the real sites and record
  the summary.
