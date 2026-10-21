# Plan: Your districts card (issue #15)

Risk tier: Medium. The card is a pure render of the precinct's attributes and fully
unit-testable, but it replaces the pending placeholder in an existing screen (altering
behavior), adds a config section and touches several files. Nothing touches auth, money,
data writes or outward messages, so nothing forces High. The run is unattended (dispatched
by the owner's orchestrator, which asks for sensible calls on low-stakes choices), so the
plan is committed without an interactive approval; the PR says so.

Domain skills:
- superpowers:test-driven-development: invoke.
- chrome-devtools-mcp (chrome-devtools): invoke for the live drive.
- vercel-react-best-practices: not applicable because the card is a pure render of one
  object, with no effects, fetching or memoization.
- frontend-design: not applicable because the card uses the existing token classes and
  card layout from #11.
- context7: not applicable because only React and Testing Library APIs already in use are
  needed.
- expo, django, django-ninja, fastapi, claude-api, dataviz: not applicable because none of
  those stacks are involved.

## Acceptance criteria

1. The "Your districts" card lists the precinct's districts as a semantic `<dl>`: one
   `<dt>` label and one `<dd>` value per shown district, in this order: U.S. House, State
   Senate, State House, County Council, Municipality, Ward, Township, School district,
   Community college subdistrict, Fire protection district, Ambulance district, Ambulance
   subdistrict, Library district, Sewer district, then the special districts (light, road,
   community improvement, business, transportation development, neighborhood improvement,
   annexation).
2. Which precinct field feeds each row lives in `src/config/election.js`
   (`districtFields`, an ordered list of `{ key, field }`; the U.S. House row uses
   `congressionalField`). The labels live in `src/features/lookup/resultsCopy.js`, keyed by
   `key`, so they can be translated without touching field names.
3. U.S. House shows `congressionalField` (the 2025 map) with its " (YYYY)" suffix stripped:
   "US Representative District 2 (2025)" shows "US Representative District 2". The old-map
   field `congressional_district_20` is never read or shown, and the pre-joined `districts`
   field is never read.
4. Empty values are hidden: `null`, `""`, whitespace only, and any non-string. Municipality
   `Unincorporated` (any case) shows "Unincorporated St. Louis County". Sewer
   `No Sewer District` is hidden.
5. School strips a leading "CUMULATIVE VOTING - " (any case) for display. No cumulative
   voting note is added (see Risks).
6. No officeholder names, party labels or candidate data: the card shows only the official
   precinct layer's district values and fixed labels. A short line under the list says the
   values come from the St. Louis County Board of Elections precinct data (the same credit
   the map uses).
7. When no district has a value, the card says it could not find the districts and links
   the county's official lookup.
8. Fixture tests: CC007 (unincorporated, no ward), MER013 (a ward, `No Sewer District`),
   NW005 (special districts: neighborhood improvement and annexation, and a cumulative
   voting school). NW005 is a new recorded live fixture.
9. The page shows the card for a loaded precinct; the "until the card is built" test counts
   it as built. No new external origin, so `render.yaml` does not change.

## Files that change

- `src/config/election.js`: `districtFields`, typedef entry; the congressional field
  defined once and reused.
- `src/config/election.test.js`: `districtFields` has unique keys, includes
  `congressionalField`, and never the old congressional field or `districts`.
- `src/features/lookup/districts.js` (new): `districtRows(precinct)`, the pure display
  rules, returning `[{ key, label, value }]`.
- `src/features/lookup/districts.test.js` (new): the rules and the three fixtures.
- `src/features/lookup/DistrictsCard.jsx` (new) and `DistrictsCard.test.jsx` (new):
  `<dl>` markup and the fallback.
- `src/features/lookup/ResultsCards.jsx`: render `DistrictsCard` in the districts slot;
  take a `precinct` prop.
- `src/features/lookup/PrecinctPage.jsx`: pass the precinct down.
- `src/features/lookup/PrecinctPage.test.jsx`: districts card built; shows CC007 rows.
- `src/features/lookup/resultsCopy.js`: labels and fallback text; pending comment no
  longer names #15.
- `scripts/record-fixtures.mjs`: record `precinct-by-id-nw005.json`.
- `docs/raw/fixtures/precinct-by-id-nw005.json` (new).

## Order of work

1. Record the NW005 fixture.
2. Config `districtFields` with its test.
3. `districtRows` with tests (TDD).
4. `DistrictsCard` with tests, wire into `ResultsCards` and `PrecinctPage`, update the
   page tests.
5. Docs, gate, live drive.

## Risks

- Showing the old congressional map would misinform voters; the config test fails if
  `districtFields` names any field other than `congressionalField` for the U.S. House row
  or includes the old-map or pre-joined field.
- The hardcoding test fails if `congressionalField`'s value appears outside the config;
  the new code reads it only through `election`.
- Cumulative voting note: not added. Cumulative voting applies to the Ferguson-Florissant
  school board election (a federal court remedy), held in April, not to this November
  general election; a note on the card could suggest voters cast cumulative votes on this
  ballot, and the only plain-language source found is the district's 2019 FAQ, not the
  county election board. Recorded as a low-stakes call in the PR.
- The municipality also shows in the page header (#11); repeating it in the list keeps the
  card complete, as the issue lists it.
- Riskiest step: the PrecinctPage test change, since it was written for the pending card.

## Proof

- Criteria 1, 3, 4, 5, 7, 8: `districts.test.js` and `DistrictsCard.test.jsx`.
- Criterion 2: `election.test.js`.
- Criterion 6: the card renders only `districtRows` output (labels from copy, values from
  the listed fields); `districts.test.js` checks the exact rows for each fixture.
- Criterion 9: `PrecinctPage.test.jsx`; `render.test.js` and
  `election-hardcoding.test.js` stay green unchanged.
- Live drive: `/p/CC007`, `/p/MER013` and `/p/NW005` show the expected rows; `/p/AP200`
  (nonresidential) still shows the districts card.
