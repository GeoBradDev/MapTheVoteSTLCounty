# Plan: County address typed with its municipality gets no match (issue #143)

Risk tier: Medium. It alters existing behavior of the strict address rules on the
election-critical lookup path (raised one tier) and touches more than a few files (raised one
tier); the rule itself is fully unit testable against a recorded live response. The fix is the
one the issue scopes (match the record's municipality, `MSAG_COMMUNITY_NAME`), and the
coordinator's brief for this run names it, so no further approval round is asked.

Domain skills: superpowers:test-driven-development, invoke. superpowers:systematic-debugging,
invoke (bug; cause already traced in the issue and confirmed live below). Frontend, React,
accessibility and design skills: not applicable because no UI or component code changes.

## Cause (confirmed live, 2026-10-24)

Both county layers hold `41 S CENTRAL AVE` (OBJECTID 142783 in the live layer, 138309 in the
hosted copy) with
`MAILINGCITY: 'SAINT LOUIS'`, `ZIPCODE: '63105'`, `MUNI: 'CLY'`,
`MSAG_COMMUNITY_NAME: 'CLAYTON'`. `recordOf` in `src/data/countyAddress.js` gives a record only
its mailing city as `city`; `matchesTyped` in `src/data/addressMatch.js` rejects a typed town that
is neither that city nor St. Louis, so with "Clayton" typed no record matches, the ZIP pool still
holds the record, and `find()` answers `ambiguous`. A picked Photon suggestion is geocoded again by
its label ("41 South Central Avenue, Clayton, MO 63105"), so it fails the same way.

`MSAG_COMMUNITY_NAME` is on both layers, with 131 distinct name and `MUNI` pairs in the live
layer; besides real towns it holds `ST LOUIS COUNTY` (unincorporated), `ST LOUIS CITY` and
`JEFFERSON COUNTY`, which are not towns a voter types as their own.

## Acceptance criteria

1. `find('41 S Central Ave, Clayton, MO 63105')` against the recorded live county answer is a
   match at the 41 S Central Ave record, confirmed, labeled with its mailing city as today
   (`41 S Central Ave, Saint Louis, MO 63105`).
2. The same with no ZIP (`41 S Central Ave, Clayton`), and the Photon pick label
   `41 South Central Avenue, Clayton, MO 63105` geocoded through the app chain (county source on
   the recorded answer, City check stubbed), is that county place.
3. The strict rules hold: a town that is neither the mailing city nor the municipality is still
   rejected (`41 S Central Ave, Ladue, MO 63105` is not a match); `41 Central Ave, Clayton`
   (no direction, N and S both in Clayton) is still no match; a wrong ZIP is still no match.
4. `ST LOUIS COUNTY`, `ST LOUIS CITY` and other county-wide `MSAG_COMMUNITY_NAME` values are not
   used as a town, so typing "St. Louis County" or "St. Louis City" matches nothing new.
5. Labels, suggestions and every other source (Photon, the City geocoder) are unchanged.
6. `scripts/check-geocoder.mjs` checks the typed address and the Photon-style label open the
   county precinct the untyped-town address opens, and fails otherwise.
7. `docs/data.md` (County address points, Geocoding rules) and the README's Address search
   section say a typed town may be the record's municipality as well as its mailing city.

## Files that change

- `src/data/countyAddress.js`: request `MSAG_COMMUNITY_NAME`; `recordOf` sets
  `props.municipality` (the raw value, `&` read as `AND`, compared through `words()`), empty when
  the value starts with ST LOUIS or ends in COUNTY; export the out fields so the fixture recorder
  asks for exactly what the app asks for. In `find()`, a typed town (no ZIP) keeps every record of
  each matching address, not only the records it matched, and a typed unit is taken only on the
  side of the City line (a county of some matched record) the text matched.
- `src/data/addressMatch.js`: `matchesTyped` and `isConfirmed` accept a typed town equal to
  `props.municipality` as well as `props.city`/`props.district`; header comment updated.
- `scripts/record-fixtures.mjs`: record `county-address-central-ave.json` (the live layer's find
  answer for the typed text, the app's own where clause and fields).
- `docs/raw/fixtures/county-address-central-ave.json`: new recorded fixture.
- `src/data/countyAddress.municipality143.test.js`: new, the red test (criteria 1 to 4).
- `src/test/build.test.js`, `README.md` (Performance), `src/cityChunk.js` (comment): the
  first-load budget raised from 120 KB to 121 KB, the owner's decision on #143.
- `src/data/countyAddress.test.js`: review finding 1 cases (1950 Walton Rd, 9300 Lewis and Clark
  Blvd, Town and Country).
- `src/data/countyAddress.cityunit143.test.js`: new, review finding 2 (6200 Enright Ave).
- `src/data/countyAddress.citysite143.test.js`: new, review finding 3 (6200 Enright Ave).
- `scripts/check-geocoder.mjs`: the #143 typed and picked cases.
- `docs/data.md`, `README.md`: the rule text.

## Order of work

1. Record the fixture (needs the exported fields; the recorder change and the export land with
   the test commit, the export being a no-behavior change).
2. Write `countyAddress.municipality143.test.js`, confirm it fails because `find` answers
   `ambiguous`, commit it red, freeze it in `.claude/fix-lock`.
3. Implement in `countyAddress.js` and `addressMatch.js`; full gate.
4. `check-geocoder.mjs` case, then run it live.
5. Docs.

## Risks

- Loosening the town rule could match a house in another town: only a record's own municipality
  name is accepted, and every other rule (whole street, direction, ZIP, one site, one precinct)
  still applies, so the riskiest step is the `matchesTyped` change; criterion 3 tests it.
- `MSAG_COMMUNITY_NAME` is the emergency-services community, which can differ from `MUNI` (for
  example `LADUE` with `MUNI` `CLY`). Chosen not to map `MUNI` codes to names: a 90-entry table
  costs first-load bytes the 120 KB budget lacks, and the readable field already names the town
  voters use for these records. Noted in the PR.
- Bundle: a few bytes in the geocoder; checked with the build's budget.

## Revisions during review

- Finder 1: `MSAG_COMMUNITY_NAME` differs between records of one address (1950 Walton Rd 63114:
  the house Overland, Unit R Vinita Park; 9300 Lewis and Clark Blvd 63137), so narrowing the pool
  to matched records skipped the unit pick and the one-precinct check and gave a wrong precinct.
  Fixed by keeping every record of each matching address (same `siteKey`). Also: "and" for
  TOWN & COUNTRY, and no ST LOUIS name as a municipality.
- Finder 2: with every record kept, `6200 Enright Ave Apt 111, University City` picked the City
  unit at a shared City and County address. First fixed by keeping only records on the matching
  record's side of the City line.
- Finder 3: that fix let a City resident's text there (`6200 Enright Ave Apt 111, University
  City`, or no unit) open the County place, which main answered as no match. Fixed by keeping
  every record of the address again and taking a typed unit only on the matched side, so both
  are no match while a County unit typed with the town still opens.
- Finder 4: keeping every record of the address made `6200 Enright Ave, St. Louis City` no match,
  where main answered the City place. Fixed by keeping main's pool (the matched records) when the
  typed town is St. Louis City (`countyAddress.stlcity143.test.js`). This fix puts the first-load
  JavaScript 3 bytes over 120 KB gzipped (122883 of 122880), and it is the second extra review
  round in a row that led to a fix, so the run stopped here for an owner decision on the budget.
- Owner decision (2026-10-24, option 1): raise the first-load budget to 121 KB (123904 bytes)
  and ship every fix, including the St. Louis City case. The budget test
  (`src/test/build.test.js`), its README line and the `src/cityChunk.js` comment now say
  121 KB. The resumed run then reviews finder 4's fix with one more finder, the gate and a
  fresh verifier.
- Main's `node scripts/check-geocoder.mjs` cannot resolve City precincts under Node since #147
  (issue #198), so the live check exits 1 on its City lines on main and here; its #143 lines pass.
- Budget: the first-load JavaScript sat 15 bytes over 120 KB gzipped after finder 1's fix, so
  the code was made smaller with the same behavior. Main had 172 bytes of headroom; this change
  leaves 4.

## Proof

- Criteria 1 to 4: `src/data/countyAddress.municipality143.test.js` (red before the fix, green
  after), plus the existing countyAddress, addressMatch and geocoder suites unchanged and green.
- Criterion 5: existing suites (labels, suggest, Photon, City tests) unchanged and green.
- Criterion 6: `node scripts/check-geocoder.mjs` run live, every #143 line a county precinct
  (the run exits 1 on the City lines only, issue #198, unrelated).
- Live drive: the built app in a browser, typing `41 S Central Ave, Clayton, MO 63105` opens the
  county precinct page; `41 S Central Ave, Ladue, MO 63105` shows no match.
