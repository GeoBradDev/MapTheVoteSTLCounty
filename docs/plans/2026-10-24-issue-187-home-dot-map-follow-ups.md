# Plan: Home dot map follow-ups from the #184 review (issue #187)

Risk tier: Medium. Changes the shared wait time loop's state (async, stateful UI) and two
readers of it, but only how long a time or list is held back while a resumed request is out;
no count, time or rule a voter sees changes. All of it is in the on-demand wait times chunk,
not the first load. Coordinator brief stands in for the plan approval (autonomous run).

Domain skills: superpowers:test-driven-development, invoke; vercel-react-best-practices, invoke
(React readers of a `useSyncExternalStore` store); frontend-design and a11y skills, not
applicable because no markup, copy or styling changes; data skills, not applicable because no
layer or field changes.

## Scope

Early voting opened 2026-10-20, so two items no longer apply and are dropped: "Home map box
never reopens on its own" (a page left open across midnight into the first early voting day)
and "Sites open again on the first day". The "Reserved height in the closed states" item is
also dropped: the head script would need every site's schedule (the City's is not in the
first load) to know the closed state before paint, which risks the CLS budget and the
first-load JS budget nine days before the election. It goes to a new issue.

## Acceptance criteria

1. The shared loop marks each board's part with `resuming`: true from when a request goes out
   after a stop (the 1.5-interval gap) until that request answers, false otherwise. The gap is
   defined once, in `useWaitTimes.js`; `WaitDotMap.jsx` no longer computes its own.
2. A slow answer (over one interval) followed by a normal refresh is not treated as a resume:
   the home map keeps its status line through it. (The shortest-lines list and the board
   note go in #209, owner decision 2026-10-24, so no #187 test asserts on them.)
3. Store tests cover `askedAt`, `resuming`, a replaced request's late answer being dropped
   (success and failure), and a new request going out after the replacement answers (the
   in-flight slot clears).
4. The wait times page's visible status line shows no "checked at" time while a resumed
   request is out, so a phone woken the next morning never shows the day before's. Its
   screen reader live region keeps its text through a resume. (Revised during review: the
   first version also emptied the live region, which made a screen reader hear an old time
   again on every return after more than 1.5 intervals, breaking the 5 minute throttle.)
5. `dotMap` drops counts with `stillShowable` (age and closing time), not closing time alone.
6. The first-load JS budget is not raised; the full gate passes. (`useWaitTimes.js` is in the
   first load: the `resuming` field adds about 51 bytes gzipped, leaving about 131 of headroom.)

## Files that change

- `src/features/waitTimes/useWaitTimes.js`: `resuming` in each part; `RESUME_GAP` constant.
- `src/features/waitTimes/WaitDotMap.jsx`: `answeredSince` reads `resuming`; drop `GAP_MS`.
- `src/features/waitTimes/WaitTimesPage.jsx`: hide the check time while either board resumes.
- `src/features/waitTimes/dotMapModel.js`: filter with `stillShowable`.
- Tests: `useWaitTimes.test.jsx`, `WaitDotMap.test.jsx`, `WaitTimesPage.test.jsx`,
  `dotMapModel.test.js`.

## Order of work

1. Store: red tests for criteria 1 and 3, then the store change.
2. Home map: red test for criterion 2 (slow answer then a refresh), then `answeredSince`.
3. Wait times page: red test for criterion 4, then the page change.
4. Model: red test for criterion 5 (a count past max age but before `openUntil`), then the
   filter.
5. Full gate, live drive of the home map and wait times page.

## Risks

- A resume that never answers keeps the home map's list and the page's time hidden; that is
  the current behavior for the home map (an unanswered resume) and the honest one for the page.
- The page now also hides the time briefly on a same-day resume; acceptable, as the kept
  counts may have been pruned during the gap.
- Existing WaitDotMap tests for the overnight and same-day wake cases must still pass unchanged.

## Proof

- Criteria 1 and 3: new `useWaitTimes.test.jsx` cases.
- Criterion 2: new `WaitDotMap.test.jsx` case, red on main.
- Criterion 4: new `WaitTimesPage.test.jsx` case, red on main.
- Criterion 5: new `dotMapModel.test.js` case, red on main.
- Criterion 6: `npm run build` and `npm run test:perf` output.
- Live drive: home page and `/early-voting` render with counts (sites are open on 2026-10-24
  during hours, or closed-state copy otherwise), no console errors.
