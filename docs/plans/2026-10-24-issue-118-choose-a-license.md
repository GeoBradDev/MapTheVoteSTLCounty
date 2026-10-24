# Plan: Choose a license for the repository (issue #118)

Risk tier: Low. A new `LICENSE` file, one `package.json` field and README text; no app code,
no runtime behavior, and a unit test covers every criterion. The license choice is the owner's
decision on the issue (2026-10-22: "use the MIT License"), so it is not re-asked.

Domain skills: superpowers:test-driven-development, invoke. humanizer, invoke for the README
copy. Frontend, accessibility, React, data and API skills: not applicable because no UI, data
or bundle code changes.

## Acceptance criteria

1. A `LICENSE` file at the repo root holds the standard MIT License text with
   `Copyright (c) 2026 Brad Stricherz`.
2. `package.json` has `"license": "MIT"`, and `package-lock.json`'s root package entry records
   the same field (npm writes it there).
3. The README's License section says the code is MIT (linking `LICENSE`); that the map data is
   (c) OpenStreetMap contributors under the ODbL, with OpenMapTiles and OpenFreeMap credits,
   which must stay shown under the map (`BASEMAP_ATTRIBUTION` in
   `src/features/lookup/basemap.js`); and that voter information, polling places, wait counts
   and sample ballots belong to their official publishers, the St. Louis County Board of
   Election Commissioners and the City of St. Louis Board of Election Commissioners, and are
   not covered by the license. The "No license has been chosen yet" text is gone.
4. The full CI gate stays green.

## Files that change

- `LICENSE` (new)
- `package.json`, `package-lock.json`
- `README.md` (License section only)
- `src/test/license.test.js` (new)
- this plan (new)

## Order of work

1. Write `src/test/license.test.js` checking criteria 1 to 3; run it red.
2. Add `LICENSE`, the `license` field in `package.json` and in `package-lock.json`'s root
   package entry (by hand: `npm install --package-lock-only` was tried and also added
   unrelated optional wasm entries to the lockfile, so it was reverted; `npm ci` accepts the
   hand-edited lockfile unchanged), and the README section; run it green.
3. Full gate.

## Risks

- `npm install --package-lock-only` could reshuffle the lockfile beyond the one field; check
  the lockfile diff is only that line.
- The README could drift from `BASEMAP_ATTRIBUTION`; the test reads the credit labels from
  that constant and checks the README names each provider.

Not done: no license headers in source files, no third-party notices file (every runtime
dependency is MIT, BSD-3-Clause or Unlicense, and no fonts are bundled).

## Proof

- Criteria 1 to 3: `src/test/license.test.js`.
- Criterion 4: the full gate output.
- Live drive: skipped; the automated gate fully covers a docs and metadata change with no
  runtime effect.
