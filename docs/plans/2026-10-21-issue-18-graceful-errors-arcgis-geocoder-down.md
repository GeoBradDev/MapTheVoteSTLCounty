# Plan: Graceful errors when ArcGIS or the geocoder is slow or down (issue #18)

Risk tier: High. Election-critical failure paths across the lookup, the results page and
the cards: stateful UI, async timing (slow notices, retries, aborts), focus and screen
reader behavior, a small change in the geocoder chain next to the wrong-precinct
safeguards of #49 and #58, and more than a few files.

Domain skills: superpowers:test-driven-development: invoke. vercel-react-best-practices:
invoke (React components and effects). chrome-devtools-mcp:a11y-debugging: not applicable
because the Playwright axe run (#26) covers the new states in a real browser. Every other
listed skill (Django, FastAPI, Expo, PWA) is not applicable because the app is a
frontend-only Vite and React site.

Plan approval: the owner's batch instructions for this run delegate low-stakes calls to the
agent and reserve a pause for real decisions; this plan has none, so it is committed
without a separate approval round.

## Acceptance criteria

1. Address lookup tells "service unavailable, try again" apart from "no match":
   - every source down (county live, hosted copy and Photon) or the City check down or
     slow is "Address search is not working right now", never "We could not find that
     address";
   - a county "no match" while Photon is down is also "not working", since the search could
     not finish;
   - a real no match (no source has it, two addresses fit, the City and the county share the
     address in one ZIP) stays "We could not find that address".
   - The geocoder still never returns a county place when the City check fails or is slow
     (#58); the change only turns some `null` answers into a `GeocoderUnavailableError`,
     and only when the caller asks for it, so every #49 and #58 test passes unchanged.
2. The precinct layer failing during a lookup (ArcGIS 5xx, timeout, network) says the
   county's precinct map is not answering; offline (`navigator.onLine === false` at the
   failure) says "You appear to be offline".
3. Every lookup error offers Use my location and the county's official lookup, and every
   error but no match offers a "Try again" button that repeats the same attempt (the same
   text or pick, or the same device location) without the voter retyping.
4. After 3 seconds of a lookup or a precinct page load, a visible "Still working..." line
   appears and is announced (`role="status"`); it goes away when the work ends.
5. Precinct page load failure (not a not-found): message, Try again button, official lookup
   link, and focus moves to the error block. Try again keeps the button in place
   (`aria-disabled`, "Trying again...") so focus is never lost; success focuses the heading
   as before; a repeat failure is announced again.
6. The polling places and early voting cards each fail on their own (the rest of the page
   stays), with the official lookup link and a Try again button that works the same way.
7. A React error boundary around the routed pages shows a plain fallback (heading focused,
   reload button, link home, official lookup link) instead of a blank screen; caught errors
   are not logged (`onCaughtError` is a no-op), and no app code uses the console.
8. Errors are announced with `role="alert"`; no error text, report or log contains the
   address text or coordinates.
9. Issue #53: starting any new search (typed, a pick, Try again, or pressing Use my
   location) forgets the previous lookup point, whatever the outcome; a test covers Back,
   failed search, Forward.
10. Playwright e2e (#26 setup, fixtures, no network) covers: every geocoder blocked
    (CORS-like network failure), county 5xx with Photon timing out, county match with the
    City geocoder failing (unavailable, never a precinct), the precinct layer 5xx during a
    lookup and on a precinct page (with retry to success and focus), a slow precinct load
    ("Still working..."), the polls layer failing alone, offline, and axe on the error
    states.

## Files that change

- `src/data/geocoder.js`: `geocode(query, { signal, reportUnavailable })`. With
  `reportUnavailable`, the two "no match because a step failed" exits reject with
  `GeocoderUnavailableError`: the City check failing or giving an unexpected answer, and a
  county no match with the fallback down. Without it, behavior is unchanged.
- `src/data/geocoderChain.test.js` or a new `src/data/geocoder.unavailable18.test.js`: new
  tests for the option (new file, so no #49/#58 test is edited).
- `src/features/lookup/AddressLookup.jsx`, `lookupCopy.js`: error kinds `noMatch`,
  `unavailable`, `failed`, `offline`; Try again; slow notice; forget the lookup point at
  the start of every run and on Use my location press; pass `reportUnavailable: true`.
- `src/features/lookup/UseMyLocation.jsx`: optional `onStart` prop, called on a press.
- `src/features/lookup/lookupPoint.js`: `forgetLookupPoint()`.
- `src/features/lookup/PrecinctPage.jsx`, `resultsCopy.js`: slow notice, retry, offline,
  focus on failure.
- `src/features/lookup/PollsCard.jsx`, `EarlyVotingCard.jsx`: Try again.
- `src/features/lookup/RetryButton.jsx`, `errorCopy.js`, `slowNotice.js` and `useRetry.js`
  (new): the shared button, the shared words and offline check, the 3 second timer, and the
  retry state with its focus hand-off for the cards.
- `src/components/ErrorBoundary.jsx` and `errorBoundaryCopy.js` (new), `src/App.jsx`,
  `src/main.jsx`.
- Tests next to each component; `e2e/failures.e2e.js` (new).
- Docs: `README.md` (Address search, a short Errors note), `docs/data.md` (City check
  failure wording), `docs/progress.md`.

## Order of work

1. Red tests for #53 (lookup point survives a failed search) and for the City-check
   failure reading as unavailable in the UI; commit red.
2. Geocoder option with its tests.
3. AddressLookup: kinds, retry, slow notice, forget point; UseMyLocation `onStart`.
4. PrecinctPage retry, slow notice, focus; cards retry.
5. ErrorBoundary and main.jsx.
6. e2e failures spec; full gate.
7. Docs.

## Risks

- Weakening #58: the option may only turn `null` into a rejection; a test asserts that
  with the City check failing the answer is never a place, with and without the option.
- Retry repeating a stale attempt after the voter edits the text: the Try again button is
  dropped on any edit.
- Focus loss when a retry button unmounts: buttons stay mounted while retrying.
- Timers leaking after unmount in tests: clear in effect cleanups.
- Conflicts with #27 (performance) in `App.jsx`, `main.jsx` and the cards: keep both sides.
- Not doing: cached polling places while offline (needs the PWA, #25); an overall cap on
  the lookup's total time (each source already has its own timeout).

## Proof

- Criterion 1: geocoder option unit tests; AddressLookup test with a geocoder rejecting
  `GeocoderUnavailableError`; e2e "City geocoder down" and "every geocoder blocked".
- Criterion 2, 3: AddressLookup tests (locate rejecting, offline, retry repeats the same
  query); e2e precinct layer 5xx during a lookup.
- Criterion 4: fake timer tests in AddressLookup and PrecinctPage; e2e slow precinct load.
- Criterion 5: PrecinctPage tests (focus on failure, retry to success); e2e.
- Criterion 6: PollsCard and EarlyVotingCard tests; e2e polls layer failing alone.
- Criterion 7: ErrorBoundary test; no-storage test still green.
- Criterion 9: AddressLookup test of the Back, failed search, Forward sequence.
- Criterion 10: `npm run test:e2e`.
- Live drive: the dev server against the real services, a search, and DevTools-style
  blocking of each host (Playwright route blocking on the live build).
