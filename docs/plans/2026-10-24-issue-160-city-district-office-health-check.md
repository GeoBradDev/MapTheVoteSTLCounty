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
   (every row, `outFields` the office field only, no geometry; not `returnDistinctValues`,
   because the hosted layer folds case there, found in the third review), and takes the
   distinct values in the script.
2. It passes when every row of `districts.rows` in `src/config/cityResults.js` has at least
   one of its `offices` among those values, matched as the card matches (trimmed, then exact and case
   sensitive), and its detail says how many rows were found.
3. It fails when any row has none of its offices on the layer, naming the row key and the
   offices it looked for, and naming a value on the layer that differs only by case or
   spacing when there is one; the hint points at `districts.rows` in
   `src/config/cityResults.js`.
4. It is a SKIP (so the run exits 1) when the `city layer districts` check failed.
5. A response with no features list fails, like the other City queries.
6. The README's Data health check paragraph says the check covers the district offices.
7. (Added after review.) The check is a WARN, never a failure, when the layer has an office
   that no row names and that is not on `CITY_OFFICES_LEFT_OUT` (the citywide and statewide
   offices and the two placeholders, at the top of the script), so an office renamed on only
   some districts is seen. An answer with no offices at all fails with its own message. The
   case or spacing hint ignores whitespace entirely. A value that names a party (the card's
   `PARTY` pattern, now exported from `src/features/lookup/cityDistricts.js`) is never a WARN:
   it is never a card row and never belongs on the list.
8. (Added after the fourth review.) A district row with no office (blank or missing after
   trimming) is a WARN, since the card drops its row there, and an answer with
   `exceededTransferLimit` fails (`too many districts for one request: page the query`) rather
   than checking part of the layer.

## Files that change

- `scripts/check-config.mjs`: the new check inside `checkCity`, and a `cityDistricts` option
  (default `cityResults.districts`) so tests can pass their own rows.
- `src/test/checkConfig.test.js`: the healthy City world answers the distinct offices query;
  new tests for pass, a renamed office (fail with the row and case hint), an alternate office
  alone (pass), and the skip.
- `README.md`: one clause in Data health check.
- `src/features/lookup/cityDistricts.js`: export `PARTY` (no behavior change) so the check
  skips party committee posts the same way the card does.
- `src/config/cityResults.js`: a comment above `districts.rows` naming the new check.

## Order of work

1. Tests first (red): healthy run lists `city district offices` and passes; renamed office
   fails; skip when the districts layer check fails.
2. Implement the check.
3. README line.

Revision after the second review: criterion 7 and its tests, and `CITY_OFFICES_LEFT_OUT` in
`scripts/check-config.mjs`; the README sentence describes both outcomes.

Revision after the fourth review: criterion 8 and its tests; `cityQuery` in
`scripts/check-config.mjs` takes a `whole` option for the cut-off check; the README and the
`districts` comment in `src/config/cityResults.js` name the WARNs.

## Risks

- The stub world's districts answer is keyed on point queries; the distinct query has no
  geometry, so the stub must recognize it (districts layer, `where` 1=1, no geometry) before
  its point fallback.
- An office that is legitimately absent between elections (a seat not up) would not remove its
  polygon: the layer holds districts, not races, so a missing office really is a rename or a
  removal worth a person's look. FAIL is right.

## Proof

- Unit tests in `src/test/checkConfig.test.js` cover criteria 1 to 5, 7 and 8.
- Live run of `node scripts/check-config.mjs` shows `PASS city district offices` against the
  real layer (official City service only).
