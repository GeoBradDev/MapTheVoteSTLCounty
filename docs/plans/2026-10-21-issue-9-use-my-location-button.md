# Plan: "Use my location" button (issue #9)

Risk tier: Medium. A stateful UI around a browser API (permission prompts, timeouts,
insecure contexts) that unit tests can only simulate, and it handles a voter's location
(privacy, election-critical). It adds rather than changes behavior, in a few files, and
every branch is testable with a mocked `navigator.geolocation`.

Domain skills:
- superpowers:test-driven-development: invoke.
- vercel-react-best-practices: invoke for the button component.
- chrome-devtools-mcp (a11y-debugging, chrome-devtools): invoke for the live drive
  (geolocation emulation, denied permission, focus).
- frontend-design: not applicable because the button uses the existing token classes; the
  landing screen layout is #10.
- context7: not applicable because only the standard Geolocation API and React Testing
  Library APIs already in use are needed.
- expo, django, django-ninja, fastapi, claude-api, dataviz: not applicable because none of
  those stacks are involved.

Mode: commit. The owner authorized commits, pushing this issue branch, the PR and its squash
merge for this run, and delegated plan approval for this run.

## Geocoder independence

#7 (which geocoder) is parked. This change does not touch geocoding. It produces the
coordinates-only place `{ lat, lng }` that `locate` (#8) already accepts and classifies,
including the `unknown` kind for a point outside the county with no state.

## Acceptance criteria

1. `src/features/lookup/deviceLocation.js` exports `getDeviceLocation()`, which resolves
   to `{ lat, lng }` (numbers, nothing else from the position) using
   `navigator.geolocation.getCurrentPosition` with `enableHighAccuracy: true`, a timeout
   (`LOCATION_TIMEOUT_MS`, 15 seconds) and `maximumAge: 0`, or rejects with a
   `LocationError` whose `reason` is one of:
   - `insecure`: `window.isSecureContext` is `false` (checked before asking, so no prompt);
   - `unsupported`: no `navigator.geolocation`;
   - `denied`: error code 1 (PERMISSION_DENIED);
   - `unavailable`: error code 2, or any other error;
   - `timeout`: error code 3.
2. `src/features/lookup/UseMyLocation.jsx` renders a "Use my location" button. Location is
   requested only when the button is pressed, never on render or page load.
3. Next to the button, always visible:
   - one short line that the location is used only to find the precinct and is not saved;
   - a warning that results use where the device is now, which may not be the voter's home
     address.
4. While the position is pending the button says "Finding your location..." and is marked
   `aria-disabled="true"` (it stays focusable); presses while pending do nothing.
5. On success the button calls `onLocate({ lat, lng })` once. The parent (#10) passes that
   place straight to `locate` (#8). The component stores the coordinates nowhere: no URL,
   no web storage, no state kept after the call.
6. On failure it shows a clear message for each reason in a `role="alert"` region, and
   moves focus to the address box (`addressInputRef`) so typing an address is the next
   step. The address box is never disabled by this component.
7. All of the component's text is in one `copy` object in
   `src/features/lookup/useMyLocationCopy.js`, ready for #19, with no party or candidate
   names.

Out of scope: placing the button on the landing screen (#10), the results screen and its
reminder of the device-location caveat (#11), errors from the precinct query (#18), the
privacy notice page (#20). Real-device checks on iOS Safari and Android Chrome need the
deployed HTTPS site (#31); this PR checks the code paths each browser takes (secure context
gate, error codes, timeout) in tests and in desktop Chrome with emulated geolocation.

## Files that change

- `src/features/lookup/deviceLocation.js` (new): `getDeviceLocation`, `LocationError`,
  `LOCATION_TIMEOUT_MS`.
- `src/features/lookup/deviceLocation.test.js` (new).
- `src/features/lookup/UseMyLocation.jsx` (new): the button, notes and messages.
- `src/features/lookup/useMyLocationCopy.js` (new): the copy.
- `src/features/lookup/UseMyLocation.test.jsx` (new).
- `docs/data.md`: a line that "Use my location" fills the coordinates-only place.

## Order of work

1. Tests for `getDeviceLocation` (each reason, options passed, only lat and lng returned),
   then the module.
2. Tests for the component (no request on render, request on press, pending state, success
   callback, each failure message, focus to the address box, nothing written to the URL or
   storage), then the copy and the component.
3. `docs/data.md`.
4. Full gate, live drive in Chrome with emulated geolocation via a temporary, uncommitted
   harness on the home page.

## Risks

- Copy honesty: the issue asks for "only used on this device", but the coordinates are sent
  to the county's ArcGIS precinct query (#20 lists it). The line instead says the location
  is used only to find the precinct and is not saved, which is true.
- iOS Safari reports an insecure page as a permission error; the `insecure` check runs first
  so the message names HTTPS rather than permission.
- Some browsers never call back when the prompt is dismissed; the timeout covers that
  (Chrome and Safari both apply the timeout only after permission, so a dismissed prompt can
  leave the button pending; the voter can still type an address since nothing is disabled).
- Focus moving on every failure, not just denial: chosen so the next step is always the
  address box.

## Proof

- Criterion 1: `deviceLocation.test.js`, one test per reason, plus options and returned
  shape.
- Criteria 2 to 7: `UseMyLocation.test.jsx`.
- Live drive: Chrome with geolocation overridden to a county point shows `onLocate` called
  with those coordinates; with permission denied, the denied message shows and focus is on
  the address input; the URL and storage stay empty.
