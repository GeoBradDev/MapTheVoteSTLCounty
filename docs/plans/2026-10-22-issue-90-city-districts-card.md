# Plan: City districts card: ward, state and congressional districts, names and numbers only (issue #90)

Risk tier: Medium. An additive card that follows the County card (#15) and the City chunk
pattern from #91 (#147); it loads data asynchronously and touches several files, but every
path is unit-testable with the recorded City fixtures, and the chunk split is covered by the
build test.

Domain skills: superpowers:test-driven-development: invoke. vercel-react-best-practices:
invoke (a lazy, suspending card and its effect). chrome-devtools-mcp:chrome-devtools: invoke
for the live drive. chrome-devtools-mcp:a11y-debugging: not applicable beyond the e2e axe
gate, because the card reuses the County card's `dl` markup. frontend-design: not applicable
because the card reuses existing styles. django, django-ninja-api, python-fastapi, expo, dataviz:
not applicable (a Vite React frontend).

## Acceptance criteria

1. A City precinct's "Your districts" card lists, in this order, the rows that have a value:
   U.S. House, State Senate, State House, Ward, Community college subdistrict, School district
   (the Board of Education, citywide). The order and the offices each row reads come from config.
2. Values are the City layer's own `district` text ("Ward 1", "Missouri House District 78",
   "First District"); labels come from the copy file (`en.json`).
3. Rows are picked by the districts at the precinct's interior point
   (`getCityDistrictsForPrecinct`), never a polygon intersect. If the answer still has two
   different values for one row, the card lists both and says so; it never lists both silently.
4. No officeholder name, photo, party, phone, email, social link or address reaches the page,
   and no request asks for those fields. A row whose office names a party (`Committeeman (R)` and
   the rest) is never shown; the card never shows the office text at all. A test fails if party
   or officeholder text could reach the page.
5. Missing data (no rows or an empty answer) shows the County card's "could not find" message
   with the City's official lookup link. A failed request says it could not load them, with the
   same link and a Try again button (the other cards' pattern, #18); focus moves to the
   districts when a retry loads them.
6. Source line: "From the St. Louis City Board of Election Commissioners' election data."
7. The congressional row is verified against official sources: the whole City is in District 1
   under the 2022 map (RSMo 128.461) and under the 2025 HB 1 text (RSMo 128.471), and the
   Revisor's note on RSMo 128.346 says the 2022 map stays in effect for November 3, 2026
   (Glahn v. Hoskins, Mo. banc, 2026-09-03). The row is shown, and `docs/data.md` records this,
   closing the #57 question. The County card's use of the 2025 field is out of scope: #150.
8. The card's code and its config load with the City chunk (#147), not the first load; the
   first load stays under 120 KB gzipped.

## Files that change

- `src/config/cityResults.js` (from #91): `districts.rows`, each `{ key, offices }`, with the
  source and date checked.
- `src/features/lookup/cityDistricts.js` (new): `cityDistrictRows(districts)`, pure.
- `src/features/lookup/CityDistrictsCard.jsx` (new): loads, renders rows, the note, the missing
  message and the source line.
- `src/cityChunk.js`: export `CityDistrictsCard`.
- `src/features/lookup/ResultsCards.jsx`: the City's `districts` body, lazily from the chunk.
- `src/features/lookup/resultsCopy.js`, `src/i18n/en.json`: `cityWard` label, the City source
  line and the two-values note.
- Tests: `cityDistricts.test.js`, `CityDistrictsCard.test.jsx` (new),
  `PrecinctPage.city89.test.jsx` (districts card no longer pending), `src/test/build.test.js`
  (City districts config marks stay out of the first load).
- `e2e/fixtures.js` (the City districts layer answers its fixture) and `e2e/a11y.e2e.js` (the
  City page waits for the districts card before the axe check).
- Docs: `docs/data.md` (St. Louis City: districts card, the First District answer), `README.md`
  (the intro's "until #90 to #92").

## Order of work

1. Wait for #149 (#91) to merge and rebase onto it (the chunk and `cityResults.js` come from it).
2. TDD `cityDistrictRows`: order, blanks, unknown offices, party offices, duplicates, two values.
3. TDD the card with the real City client and fetch stubbed with recorded fixtures.
4. Wire it in `ResultsCards.jsx` and the chunk; update the City page test and the build test.
5. Docs, then the full gate.

## Risks

- A layer rename of an office (`Community College Trustee` vs the row's `St. Louis Community
  College Trustee`): rows list every office name seen, and the health check is untouched.
- The lazy card could add a first-load import: the build test checks the marks.
- The first load had 16 bytes of room after #91; the new copy strings (en.json, which every
  page loads, by the i18n rule of #19) take about 150 bytes gzipped. The owner's fix is #147
  (learn topic Markdown out of the first load), run separately; this branch waits for it and
  rebases rather than raising the budget or moving strings out of en.json.
- A second outline request: `getCityPrecinctGeometry` shares the latest precinct's request.

## Proof

- Criteria 1, 2, 4, 6: `cityDistricts.test.js` and `CityDistrictsCard.test.jsx` (fixture
  answer for one precinct; injected officeholder and party attributes and a `Committeeman (R)`
  row never reach the DOM).
- Criterion 3: the card test checks the districts query is a point inside the outline, and a
  two-value answer lists both with the note.
- Criterion 5: empty answer, failed request.
- Criterion 8: `src/test/build.test.js`.
- Live drive: `/p/W14P02` (or another City precinct) in the dev build against the live City
  layers shows the six rows and the source line; a County precinct's card is unchanged.
