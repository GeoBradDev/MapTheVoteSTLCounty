# Plan: /early-voting median LCP sits at the 2.5 s limit in CI (issue #151)

Risk tier: Low. One loading fallback changes; it is static markup a unit test fully covers,
and the Lighthouse run in CI proves the timing. No data, API or schema change.

Domain skills: chrome-devtools-mcp:debug-optimize-lcp: invoke (the issue is an LCP budget).
superpowers:test-driven-development: invoke. vercel-react-best-practices: not applicable
because the change is one Suspense fallback, not a data or bundle pattern. a11y-debugging:
not applicable beyond the existing axe e2e run, which covers /early-voting.

## Diagnosis

Measured on main (28bfe43), local `npm run test:perf`: `/early-voting` LCP 2425 ms, FCP
1579 ms. The LCP element is the intro paragraph (`main > p.mt-2`, "How many people are in
line right now..."), which needs no data. But it lives in the lazy `WaitTimesPage` chunk
(#104), so it paints only after that chunk loads, and in the observed trace the page's
data requests (County polls layer, both line count layers, the City chunk) start in the
same frame, about 1 ms before the paint. Lighthouse's simulation therefore puts the new
connections to the ArcGIS hosts (DNS, TCP, TLS at 150 ms RTT) in the LCP's dependency
graph, which is why the static paragraph lands at the same time as the data driven results
page (2417 ms). The budget is right; the page paints its main content too late.

## Acceptance criteria

1. While the wait times page's code loads, `/early-voting` already shows its heading,
   intro paragraph and the City paragraph, with the same text and classes the page renders,
   so the largest text paints before the page chunk and before any data request.
2. The fallback heading is not focusable (no `tabindex`), so the in-app arrival focus logic
   in `App.jsx` still finds no heading and the page focuses its own when it mounts.
3. The page itself is unchanged: same heading, intro, focus and data behavior; all
   existing tests pass unchanged.
4. `npm run test:perf` passes with `/early-voting` median LCP well under 2500 ms locally
   and in CI (target under 2200 ms). The LCP limit is not changed.

## Files that change

- `src/features/waitTimes/WaitTimesIntro.jsx` (new): the heading and the two intro
  paragraphs, taking an optional heading ref and tabIndex, used by both the page and the
  fallback so the two cannot drift.
- `src/features/waitTimes/WaitTimesPage.jsx`: renders `WaitTimesIntro` with its ref.
- `src/App.jsx`: the Suspense fallback renders `WaitTimesIntro` (no tabIndex) above the
  `min-h-screen` placeholder.
- `src/App.test.jsx`: a test that the fallback shows the heading and intro before the
  page chunk resolves, and that the fallback heading has no tabindex.

## Order of work

1. Red test in `src/App.test.jsx` for criteria 1 and 2.
2. Add `WaitTimesIntro`, use it in the page and the fallback.
3. Full gate, then `npm run test:perf` to record the before and after.

## Risks

- A later, larger text element replacing the fallback would still set a later LCP. The
  page renders the same intro at the same size, and LCP only reports a strictly larger
  element, so the swap does not move LCP. Verified with the Lighthouse run.
- A duplicate h1 for the instant the chunk loads: the fallback is replaced, never shown
  alongside the page.

## Proof

- Criteria 1, 2: the new App test. Criterion 3: the existing suite. Criterion 4: the
  `npm run test:perf` output, local and CI, quoted in the PR.
