# Plan: Use my location ignores accuracy (issue #83)

Risk tier: Medium. It changes existing behavior of an election-critical flow (some device
fixes that opened a precinct page now do not), but in 3 files, with no async or contract
change visible to callers, and every branch is testable with a mocked
`navigator.geolocation`.

Domain skills:
- superpowers:test-driven-development: invoke.
- vercel-react-best-practices: not applicable because the component does not change; the
  new reason reuses its existing error path.
- chrome-devtools-mcp: invoke for the live drive (geolocation emulation with a coarse and a
  precise accuracy).
- frontend-design, dataviz: not applicable because no layout or visual change.
- context7: not applicable because only the standard Geolocation API is used.
- expo, django, django-ninja, fastapi, claude-api: not applicable because none of those
  stacks are involved.

Mode: commit. The owner authorized commits, pushing this issue branch, the PR and its squash
merge for this run, and delegated plan approval for this run.

## Acceptance criteria

1. A device position whose accuracy radius is above `MAX_ACCURACY_M` (100 m) never reaches
   `onLocate`, so it never runs `locate()` or opens a precinct page, in the County or (once
   #88 lands) the City.
2. A position with a missing, non-finite or negative accuracy is treated the same way.
3. A position with accuracy at or below 100 m (0 included) still resolves to `{ lat, lng }`
   only: the accuracy never leaves `deviceLocation.js`, and is never stored or logged.
4. For a coarse fix the voter sees a plain-language message, in the existing `role="alert"`,
   saying the device could only estimate the location roughly and to type the address, and
   focus moves to the address box, like the other location errors.
5. The message names no party or candidate; the privacy notice changes only if what is read
   from the device is described wrongly by it.

## Threshold

100 m, the example in the issue. Checked against the live 2026-11 precinct layer (1213
polygons): the median precinct is about 880 m across and the smallest quarter under about
440 m, with a few slivers under 50 m. No radius rules out a wrong precinct near a boundary,
so the threshold is set to keep phones working (indoor Wi-Fi fixes commonly report 20 to
65 m; GPS 5 to 20 m) while rejecting the Wi-Fi/IP estimates of laptops and iOS
"Precise: Off" (kilometers), which are the failure the issue describes.

Not done: the optional boundary-crossing check (points on the accuracy circle through
`getPrecinctCodesAtPoints`). It adds network queries and a new failure mode two weeks before
the election; noted in the PR as a possible follow-up.

## Files that change

- `src/features/lookup/deviceLocation.js`: read `coords.accuracy`; add the exported
  `MAX_ACCURACY_M = 100`; reject with `LocationError('coarse')` when accuracy is not a finite
  number in `[0, MAX_ACCURACY_M]`. Add `'coarse'` to the `LocationReason` typedef. Update the
  module comment (accuracy is read, still never leaves the module).
- `src/features/lookup/useMyLocationCopy.js`: `errors.coarse`.
- `src/features/lookup/deviceLocation.test.js`, `src/features/lookup/UseMyLocation.test.jsx`:
  new tests; the "copy for every failure reason" list gains `coarse`.
- `UseMyLocation.jsx` needs no change: it already maps any reason in `copy.errors` to its
  message and focuses the address box.

## Order of work

1. Red tests in `deviceLocation.test.js` (coarse, missing, NaN, negative, boundary 100,
   0) and `UseMyLocation.test.jsx` (coarse fix shows message, focuses box, no `onLocate`).
   Commit red.
2. Implement in `deviceLocation.js` and the copy. Green.
3. Full gate, live drive.

## Risks

- Too strict a threshold blocks real phone users indoors; 100 m keeps typical Wi-Fi fixes.
- Playwright's `setGeolocation` defaults accuracy to 0; 0 must count as precise, or
  `e2e/failures.e2e.js` would regress.
- Other tests mocking positions all pass accuracy 10, so they keep working.

## Proof

- Criteria 1, 2, 3: `deviceLocation.test.js` cases.
- Criterion 4: `UseMyLocation.test.jsx` coarse case (alert text, focus, `onLocate` not
  called).
- Criterion 5: the existing copy test plus the new reason in its list.
- Live drive: in Chromium with emulated geolocation, accuracy 5000 shows the coarse message
  with focus in the address box and stays on `/`; accuracy 10 opens `/p/<code>`.
