# Plan: County districts card shows the 2022 congressional map (issue #150)

Risk tier: Medium. A one-field config switch that changes what voters see (altering existing
behavior), fully exercised by unit tests; the health check addition is additive. The owner
decided the approach on 2026-10-22 ("verify, then switch"), which stands as the plan approval.

Domain skills: superpowers:test-driven-development, invoke. Frontend, accessibility and design
skills, not applicable because no UI code or copy changes: the card already strips the
`(2022)` or `(2025)` suffix (`src/features/lookup/districts.js`).

## Verification (official sources only, 2026-10-23)

- Revisor's note on RSMo 128.346 (revisor.mo.gov): on September 3, 2026, Glahn v. Hoskins,
  No. SC101805 (Mo. banc), held H.B. 1 (the 2025 map) does not take effect unless voters
  approve it; "The congressional districts established by the General Assembly in 2022 remain
  in full force and effect for the November 2026 general election."
- The County Board's own sample ballot PDFs, linked from each precinct's `html` field on
  `precincts_2026_11_view`: of the 1213 precincts, 121 have different districts in
  `congressional_district_20` and `congressional_district_25`; 95 of those have a ballot. Every
  one of the 95 ballots' "U.S. REPRESENTATIVE - DISTRICT N" matches `congressional_district_20`
  and none matches `congressional_district_25` (covering 1 to 2, 2 to 1, 2 to 3 and 1 to 3).
- The 2022 field holds only District 1 and District 2 across the County.
- St. Louis City: RSMo 128.461 (2022) and 128.471 (2025) both put St. Louis City in the first
  district, so the City card's "First District" (#90) is unaffected.

## Acceptance criteria

1. `congressionalField` in `src/config/election.js` is `congressional_district_20`, and the
   County districts card shows the 2022 district (CC007 shows "US Representative District 1").
2. The card shows no other congressional field (the 2025 field is never read).
3. The data health check fails when a precinct's congressional value is not a 2022-map value
   for District 1 or 2, or when the field is missing.
4. `docs/data.md` and the comments in `src/config/election.js` say the 2022 map applies for
   November 3, 2026 and why, with the sources.

## Files that change

- `src/config/election.js`: the field and its comment, and `congressionalMap` (the map year
  and the County's districts on it), which the health check reads so the next election's
  map is a config change (added after review).
- `src/config/election.test.js`: pin the field to the 2022 map.
- `src/features/lookup/PrecinctPage.test.jsx`, `src/features/lookup/districts.test.js`:
  expectations for the 2022 map.
- `scripts/check-config.mjs`: a `congressional districts` check over every precinct.
- `src/test/checkConfig.test.js`: tests for it.
- `docs/data.md`: field table and a note on the map.
- `README.md`: the new-election checklist (check which map is in effect) and the health
  check description.

## Order of work

1. Tests first: the config test pins `congressional_district_20`; the PrecinctPage test expects
   District 1 for CC007; the health check tests expect the new check. Run, see red.
2. Switch the config; add the health check. Run, see green.
3. Docs.

## Risks

- A test elsewhere assumes the 2025 field's value (search for `congressional_district_25`).
- The health check query must stay a single request (no new request needed: add the field to
  the precinct count query).
- Not done: hiding the row (the sources agree, so it is not needed); changing #90's City card.

## Proof

- Criterion 1, 2: `election.test.js`, `PrecinctPage.test.jsx`, `districts.test.js`.
- Criterion 3: `checkConfig.test.js`, and a live run of `node scripts/check-config.mjs`.
- Live drive: the built site, a CC007 lookup, the districts card shows District 1.
