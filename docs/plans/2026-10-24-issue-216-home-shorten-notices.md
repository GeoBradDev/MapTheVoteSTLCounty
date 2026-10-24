# Plan: Home page: shorten the address search notices and close the gap under the dot map legend (issue #216)

Risk tier: Medium. A UI change across a shared component (the lookup on the home, not-found and
precinct "not found" pages) and the home map box's reserved layout, which unit tests cannot fully
exercise (layout shift, above the fold); no data, auth or sending changes. The goals are the
owner's (direct request 2026-10-24, relayed by the coordinator), so no extra approval gate.

Domain skills:
- superpowers:test-driven-development: invoke.
- vercel-react-best-practices: invoke (React components, first-load budget).
- frontend-design: not applicable because the change stays inside the existing design system
  (#78 components and tokens); no new visual direction.
- chrome-devtools-mcp:a11y-debugging: not applicable because `e2e/a11y.e2e.js` (axe, 44 px
  targets, focus) runs on every route in the gate; the live drive uses Playwright.
- dataviz: not applicable because the dot map's marks, colors and legend content do not change,
  only where the space goes.

## Acceptance criteria

1. Under the address search (home, not-found page, and the precinct page's "search instead"),
   the visible text is one short line ("Your address and location are used only to find your
   precinct and are not saved.") plus a closed-by-default disclosure ("Address search sources")
   holding: each service that gets the address (County address points with its link, Photon by
   komoot with its link, the City of St. Louis address search), the "Photon data ©
   OpenStreetMap contributors" credit with its link to the OSM copyright page, that the address
   is sent only to these services and this site does not save it, and a link to `/privacy`.
2. The "Results are for where your device is now, which may not be your home address..." note
   no longer shows before any lookup. It shows after a Use my location result: on the precinct
   page reached by Use my location (not by a typed address, a reload or a shared link), and with
   the out-of-area notice when Use my location found a place outside both jurisdictions.
3. On the home page, the space between the dot map's last line (legend, or the no-count line)
   and the "Detailed early voting wait times map" button is the button's own margin (16 px,
   under 24 px) in every calendar state, at 360, 390, 640 and 1280 px wide.
4. The wait times button still does not move when the map loads in any calendar state (the
   existing e2e test, unchanged), and the box still reserves its height before the app runs.
5. The address search stays above the fold at 360x640, 375x667, 390x844 and 1280x800 in all
   six calendar states (existing e2e test, unchanged).
6. The privacy notice tests and license/credit tests still assert the same facts; first-load
   JS stays under 121 KB gzipped; lint, format, unit, build, e2e and Lighthouse pass.

## Files that change

- `src/i18n/en.json`: `useMyLocation.privacy` becomes the one line; add
  `lookup.attribution.summary`, `lookup.attribution.privacyBefore`,
  `lookup.attribution.privacyLink`.
- `src/features/lookup/lookupCopy.js`: the new keys.
- `src/features/lookup/GeocoderAttribution.jsx`: the credits paragraph inside `Disclosure`
  (closed by default, opened for print), plus the privacy link.
- `src/features/lookup/UseMyLocation.jsx`: the notes are the one line only (still the button's
  description); `notHome` leaves this component.
- `src/features/lookup/lookupPoint.js`: remember whether the point came from the device
  (`lookupFromDevice(code)`), memory only like the point.
- `src/features/lookup/AddressLookup.jsx`: pass the source to `rememberLookupPoint`; show
  `notHome` (an info `Notice`) above the out-of-area notice when the outcome came from Use my
  location.
- `src/features/lookup/PrecinctPage.jsx`: show `notHome` as an info `Notice` under the header
  when `lookupFromDevice(code)`, read once at mount like the origin.
- `src/features/waitTimes/WaitDotMap.jsx`: the section is a flex column filling the box; the map
  card grows to take the box's spare height (the drawing scales, the skeleton too), so the
  legend's last line sits at the box's bottom and the button follows it.
- `src/index.css`: the open box is `display: flex; flex-direction: column` (reserved
  min-heights unchanged); comment updated.
- Tests: `GeocoderAttribution.test.jsx`, `UseMyLocation.test.jsx`, `AddressLookup.test.jsx`,
  `lookupPoint.test.js`, `PrecinctPage.test.jsx` (wording and the new behavior; facts kept),
  `e2e/a11y.e2e.js` (gap assertion per calendar state; attribution reachable by opening the
  disclosure).
- `README.md` (Address search / Privacy / Map sections) only where text becomes wrong.

## Order of work

1. Red e2e test: gap from the map section's bottom to the button is under 24 px in every state
   (fails today: 44 to 168 px). Red unit tests for the disclosure and the notHome placement.
2. CSS + WaitDotMap flex change; rerun the e2e gap, stays-put and above-the-fold tests.
3. Copy, GeocoderAttribution, UseMyLocation, lookupPoint, AddressLookup, PrecinctPage.
4. Update the old-wording tests to the new wording, keeping each fact asserted.
5. Full gate, bundle size check, live drive.

## Risks

- The flex fill must not change the box's height: the box keeps its CSS min-height and the
  section only grows into it; content taller than the reserve still grows the box as before.
- The SVG drawing keeps its aspect ratio (meet), so in tall boxes it letterboxes inside the card
  rather than stretching; the skeleton fills the same area.
- Hiding the credits in a closed disclosure: the OSM credit stays in the DOM, one tap away, next
  to the search and opened for printing; the privacy page also names every service.
- The precinct page note is rendered from the first commit (module memory), so it does not shift
  the page; direct loads (Lighthouse, LCP tests) never have it.
- First-load budget: `Disclosure` is already in the first-load chunk; net copy shrinks.

Not done: no head-script prediction of the closed states (needs every site's schedule in the
first load, rejected in #187/#209).

## Proof

- Criterion 1: `GeocoderAttribution.test.jsx` (each credit link and text, closed by default,
  privacy link), `AddressLookup.test.jsx` (order), `UseMyLocation.test.jsx` (the one line).
- Criterion 2: `UseMyLocation.test.jsx` (no notHome before a result), `lookupPoint.test.js`,
  `AddressLookup.test.jsx` (notHome with an out-of-area location result, not with an address),
  `PrecinctPage.test.jsx` (notHome after a device lookup only).
- Criteria 3 to 5: `e2e/a11y.e2e.js` home page dot map tests and the above-the-fold test.
- Criterion 6: `PrivacyPage.test.jsx`, `build.test.js`, the full gate.
- Live drive: the home page at 360 and 1280 in an open and a closed state shows the one line,
  the closed disclosure that opens to the credits, and the button right under the legend.
