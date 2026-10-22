# Plan: Early voting line counts: record the County's Voters_in_Line_View source, capture fixtures, settle the City source (issue #102)

Risk tier: Low. Docs and recorded fixtures only; no app code reads them yet (#103 will).
One small test checks the fixtures' shape and that the join claim in the docs holds for
them, so the gate covers everything this change adds.

Domain skills: superpowers:test-driven-development: invoke (the fixture test). Frontend,
accessibility, React, dataviz, Django, FastAPI, Expo: not applicable because no UI, API or
app code changes.

## Acceptance criteria

1. `docs/data.md`'s "Wait times" section says, for the County and for the City, where early
   voting waits come from (layer URL), how a report joins to a site, what unit the value is
   in, and how freshness is known, with the date checked. It replaces the `inline` proposal
   and "Revisit `Voters_in_Line_View` on Election Day".
2. It records what the 2026-10-22 open-hours samples showed: how often sites report,
   whether every site reports, and whether every `Creator` matches an `absentee` value on
   the polls layer. If no site reported, it says so.
3. `docs/raw/fixtures/` gains real responses, recorded with the query #103 will make:
   - `county-waits-fresh.json`: `Voters_in_Line_View` during open hours on 2026-10-22,
     with at least one row (only if a site reported; otherwise criterion 2 says so and the
     file is not invented).
   - `county-waits-empty.json`: the same query before the sites opened (0 rows).
   - `city-waits-fresh.json` and `city-waits-stale.json`: the City layer during City open
     hours on 2026-10-22, and before they opened (the 2026-10-21 reports).
4. A test checks every wait fixture parses as an ArcGIS query response with the fields
   #103 reads, that every `Creator` in the County fresh fixture matches an `absentee` value
   in `absentee-sites.json`, and that every County fresh `CreationDate` falls within that
   day's open hours in Central time.
5. The owner's no-data decision (option 1) is recorded in `docs/data.md`, on #102 (owner's
   comment) and on #104; the `decision needed` label is removed from #102.
6. Anything found that changes #103's assumptions (the City unit) is commented on #103.

## Files that change

- `docs/data.md`: rewrite "Wait times"; one line under the polls table's `inline` row.
- `docs/raw/fixtures/county-waits-fresh.json`, `county-waits-empty.json`,
  `city-waits-fresh.json`, `city-waits-stale.json`: new, real.
- `src/data/waitFixtures.test.js`: new.
- `scripts/record-fixtures.mjs`: a comment that the wait fixtures are recorded by hand
  during open hours, not by this script (a night run would record empty layers).

## Order of work

1. Sample both layers every 15 minutes from 7:40 a.m. Central (scratchpad, not committed).
2. Write the fixture test against the fixture names (red: files missing).
3. Copy one real open-hours sample of each into `docs/raw/fixtures/`; test green.
4. Write `docs/data.md` from the samples.
5. Issue comments (#103, #104).

## Risks

- No County site reports by mid-morning: then no fresh fixture, and the doc says so.
- The City layer is a join view whose wait fields carry a numeric suffix
  (`_1740505041182`); a republish could rename them. The doc names that risk.
- Fixtures in `docs/raw/` are not Prettier-formatted (ignored), so they stay byte-for-byte
  as the service returned them, pretty-printed with `JSON.stringify(_, null, 2)` like the
  others.

## Proof

- Criterion 3 and 4: `src/data/waitFixtures.test.js`.
- Criteria 1, 2, 5, 6: read the doc and the issue comments; the finder checks them against
  the samples.
- Live drive: not applicable, no app behavior changes; the samples are the live evidence.
