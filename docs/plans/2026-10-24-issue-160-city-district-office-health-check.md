# Plan: the data health check covers the City district offices (issue #160, item 2)

Risk tier: Low. Adds one check to `scripts/check-config.mjs`, a hand-run and scheduled script
that the app never imports; it is fully unit testable with the existing stubbed `fetch` world
and changes no app behavior.

Domain skills: superpowers:test-driven-development, invoke. Frontend, accessibility, React
and design skills: not applicable because no UI or app code changes. Data: the check reads
only the City Board's public districts layer (`electedoffice` distinct values), never voter
data and never the officeholder fields.

Scope: item 2 of #160 only (coordinator instruction). Item 1 (an outline with no inside shows
"could not load" instead of the missing message) is not a defect for any current precinct and
is deferred; #160 stays open for it, and the PR says `Refs #160`.

## Acceptance criteria

1. `node scripts/check-config.mjs` runs a new check, `city district offices`, after the City
   layer checks, that asks the City districts layer for its distinct `electedoffice` values
   (`returnDistinctValues`, `outFields` the office field only, no geometry).
2. It passes when every row of `districts.rows` in `src/config/cityResults.js` has at least
   one of its `offices` among those values, matched exactly as the card matches (case
   sensitive), and its detail says how many rows were found.
3. It fails when any row has none of its offices on the layer, naming the row key and the
   offices it looked for, and naming a value on the layer that differs only by case or
   spacing when there is one; the hint points at `districts.rows` in
   `src/config/cityResults.js`.
4. It is a SKIP (so the run exits 1) when the `city layer districts` check failed.
5. A response with no features list fails, like the other City queries.
6. The README's Data health check paragraph says the check covers the district offices.

## Files that change

- `scripts/check-config.mjs`: the new check inside `checkCity`, and a `cityDistricts` option
  (default `cityResults.districts`) so tests can pass their own rows.
- `src/test/checkConfig.test.js`: the healthy City world answers the distinct offices query;
  new tests for pass, a renamed office (fail with the row and case hint), an alternate office
  alone (pass), and the skip.
- `README.md`: one clause in Data health check.

## Order of work

1. Tests first (red): healthy run lists `city district offices` and passes; renamed office
   fails; skip when the districts layer check fails.
2. Implement the check.
3. README line.

## Risks

- The stub world's districts answer is keyed on point queries; the distinct query has no
  geometry, so the stub must recognize `returnDistinctValues` before its point fallback.
- An office that is legitimately absent between elections (a seat not up) would not remove its
  polygon: the layer holds districts, not races, so a missing office really is a rename or a
  removal worth a person's look. FAIL is right.

## Proof

- Unit tests in `src/test/checkConfig.test.js` cover criteria 1 to 5.
- Live run of `node scripts/check-config.mjs` shows `PASS city district offices` against the
  real layer (official City service only).
