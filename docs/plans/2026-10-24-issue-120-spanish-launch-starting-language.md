# Plan: Spanish launch: starting language, remaining untranslated text (issue #120)

Risk tier: Low. English output stays character for character the same, every changed string is
covered by existing render tests, and no stateful or async behavior changes; weighted for
testability over the file count.

Domain skills: superpowers:test-driven-development: invoke. vercel-react-best-practices: not
applicable because no component's rendering, state or data flow changes, only where two strings
come from. chrome-devtools-mcp:a11y-debugging: not applicable because no markup, role or name
changes. frontend-design: not applicable because nothing visual changes.

## Scope

The issue's first task (the starting language: always English, the browser's language, or
`?lang=`) is an owner decision and is not done here. The tab title and meta description in
`index.html`, and MapLibre's built-in text, are also left: how they are served in Spanish
depends on that decision (pre-rendered pages, #99) and on the 120 KB first-load budget, which
has about 170 bytes left. This change does only what is independent of the decision and costs
almost no first-load bytes.

## Acceptance criteria

1. The address search credit's common words ("address points", "address search",
   "contributors") come from `en.json` through `t()`; provider names and links stay in the
   geocoder modules. English text is unchanged.
2. The map credit's "contributors" phrase comes from `en.json`; "OpenFreeMap", "OpenMapTiles"
   and "OpenStreetMap" stay names. English text is unchanged.
3. A polling place distance is formatted with `Intl.NumberFormat` in the current language,
   one decimal place, and its plural still follows the number as shown ("1.0 mile",
   "0.9 miles"), including at rounding edges such as 0.95.
4. `electionName` needs no per-language value: it is only the health check's log line and is
   never shown to voters. README says so.
5. First-load JavaScript stays under 120 KB gzipped (`src/test/build.test.js`).

## Files that change

- `src/i18n/en.json`: `lookup.attribution.countyData`, `cityService`, `contributors`.
- `src/i18n/index.js`: `formatNumber()`, cached like `formatDate()`.
- `src/data/countyAddress.js`, `src/data/cityAddress.js`, `src/data/photon.js`: drop the
  common-word fields, keep names and links (Photon's `data` becomes `OpenStreetMap`).
- `src/features/lookup/lookupCopy.js`, `GeocoderAttribution.jsx`: build the credit from them.
- `src/features/lookup/basemap.js`, `PrecinctMap.jsx`, `src/features/waitTimes/WaitTimesMap.jsx`:
  the OpenStreetMap entry is credited through the same `contributors` message.
- `src/features/lookup/resultsCopy.js`: the distance.
- Tests next to each, and README's Languages section.

## Order of work

1. Tests for `formatNumber` and the distance rounding edge, red, then the code.
2. Tests for the credit text and link names, then the moves.
3. README, then the full gate and the first-load measurement.

## Risks

- The first-load budget: measure after the build; drop the riskiest part if it goes over.
- Link names in tests (`OpenStreetMap contributors`) must still match.
- The privacy notice reads `attribution.fallback.service` and `serviceBy` only, unchanged.

## Proof

- `src/i18n/format.test.js` or `i18n.test.jsx`: `formatNumber` in en and a test locale.
- `resultsCopy` tests: 0.95 gives "0.9 miles", 1.0 gives "1.0 mile".
- `GeocoderAttribution.test.jsx`, `PrecinctMap.test.jsx`, `WaitTimesMap.test.jsx`: unchanged
  English text, and the text follows a test locale's messages.
- `src/test/build.test.js`: the first-load budget.
- Live drive: the home page credit and a precinct page's distances and map credit read as before.
