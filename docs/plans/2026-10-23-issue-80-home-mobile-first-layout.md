# Plan: Home page: mobile-first layout with the address search and Use my location above the fold (issue #80)
Risk tier: Medium. Layout and copy only, but it alters existing behavior on a pre-rendered page and in the shared lookup (home, precinct and not-found pages), and "above the fold" is provable only in a real browser (e2e), not in a unit test.
Domain skills: superpowers:test-driven-development invoke; frontend-design:frontend-design invoke (bounded: existing oklch tokens and the system font stack only, no new components, since #78 owns the shared Button, Link and Card); vercel-react-best-practices not applicable because no new React state, effects or data fetching are added; chrome-devtools-mcp:a11y-debugging not applicable because e2e/a11y.e2e.js runs axe, reflow and focus checks on `/` at 360 and 1280 px, and the live drive uses the same Playwright build.

Coordinator notes that override the issue text: no Election Day rule on the home page (#165), so the "vote at any polling place" line is dropped; copy lives in `src/i18n/en.json` (#19); #78 is not done, so styling stays local and minimal for #78 to absorb; the /early-voting link (#104, #107) is placed in the hero.

## Acceptance criteria
1. At 360 x 640 the heading, the address input, "Find my precinct", "Use my location", the nonpartisan line (#71) and the wait times link (#104) are all fully in the viewport without scrolling (e2e).
2. The hero shows, right after the heading (the app focuses the h1 after an in-app link, so reading on from it must reach the date), the election date as one compact line (a pill, "Election Day: Tue, Nov 3, 2026"), built from `election.electionDate` and `election.timeZone`, inside a `<time dateTime>`; the separate eyebrow and the "Election Day is ..." sentence are gone.
3. "Use my location" sits directly below "Find my precinct" as a full-width (at phone width) secondary button with a 2px primary border; the location privacy and "not your home" notes and the geocoder attribution follow the two actions, in small type, still visible (no disclosure: the OSM / Photon / County credits stay on the page as their terms ask).
4. The geocoder attribution keeps every credit and link and the same text; only its position moves (after the actions). This holds on every page that uses `AddressLookup` (home, precinct, not found).
5. "How to vote" and both boards' sites are tappable rows (bordered, at least 44 px tall, full width) in the "More information" nav.
6. The home page states no Election Day rule (#165 test unchanged).
7. The wait times link label still switches to "See Election Day line counts" on Election Day (#107); it is placed in the hero between the intro block and the address search.
8. Autocomplete behavior and its tests (#49, #58) are unchanged; existing HomePage, AddressLookup, AddressSearch and UseMyLocation tests pass (HomePage tests updated only where the issue changes the header).
9. The `/` Lighthouse budget passes; first-load JS stays under the 120 KB gzip budget; the pre-render (#99) still works.

## Files that change
- `src/features/lookup/HomePage.jsx`: header with the heading, date pill, intro, nonpartisan line; wait times link; nav as rows.
- `src/features/lookup/homeCopy.js`: `electionDay` formats the short date.
- `src/i18n/en.json`: `home.electionDay` becomes "Election Day: {date}".
- `src/features/lookup/HomePage.test.jsx`: header test for the pill (no eyebrow), short date format, nav rows order test, the wait times link between the header and the address box.
- `src/features/lookup/AddressLookup.jsx`: order becomes search, error, retry, Use my location, attribution, slow notice, outcome.
- `src/features/lookup/AddressLookup.test.jsx`: DOM order test: "Use my location" is the button right after "Find my precinct", and the attribution follows both.
- `src/features/lookup/UseMyLocation.jsx`: button styling (full width at phone width, 2px border, semibold).
- `e2e/a11y.e2e.js`: the #71 above-the-fold test also asserts the heading, "Find my precinct" and "Use my location".
- Docs only where now wrong (Phase 8).

## Order of work
1. Tests first: HomePage pill and short date, AddressLookup attribution order, e2e above-the-fold. See them fail.
2. Copy and HomePage header.
3. AddressLookup order and UseMyLocation button.
4. Nav rows.
5. Build, measure at 360 x 640, gate.

## Risks
- Height at 360 x 640: the wait times link above the search pushes the actions down. Riskiest step; measured in the e2e test. If it does not fit, tighten the hero type before moving the link.
- Moving the attribution in `AddressLookup` changes the precinct and not-found pages too; that is intended (same component, same order) and their tests are checked.
- `aria-describedby` on "Use my location" still points at its notes; unchanged.
- The pre-rendered HTML must match the client render (no time-dependent text in the hero other than the existing #107 label switch).
- The election's display name (`electionName`) is no longer rendered: the pill's "Election Day: <date>" replaces the eyebrow, as the issue proposes; `electionName` stays in the config for the health check.
- Not done: a disclosure for the fine print (attribution must stay visible), shared components (#78), any Election Day rule (#165).

## Proof
- HomePage.test.jsx: criteria 2, 5, 6, 7.
- AddressLookup.test.jsx: criteria 3, 4 (order).
- GeocoderAttribution.test.jsx, AddressSearch*.test.jsx, UseMyLocation.test.jsx unchanged: criteria 4, 8.
- e2e/a11y.e2e.js above-the-fold test: criterion 1; axe at 360 and 1280 px.
- npm run test:perf: criterion 9; build.test.js: JS budget and pre-render.
- Live drive: screenshot of `/` at 360 x 640 showing all criterion 1 items; type an address and pick a suggestion; tap "Use my location" with denied permission and see the error.
