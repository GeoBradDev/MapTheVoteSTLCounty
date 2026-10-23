# Plan: City parity in the health check, fixtures, e2e, Lighthouse and smoke test (issue #95)

Risk tier: Medium. Tooling and tests only, no app code changes, but it touches more than a
few files and adds a City route to the Lighthouse budget run, whose result a unit test
cannot predict. The coordinator runs this without a human pause, so the plan is committed
without one; the PR is the review point.

Domain skills: superpowers:test-driven-development: invoke (the smoke and inspect-data
changes get tests first). chrome-devtools-mcp:debug-optimize-lcp: invoke only if the City
route misses the LCP budget. chrome-devtools-mcp:a11y-debugging: not applicable because
the City results route already runs axe at 360 px and 1280 px in `e2e/a11y.e2e.js` (#89).
vercel-react-best-practices: not applicable because no React code changes.

## Audit of the task list against main (52626a2)

| Task | State on main | Done by |
| --- | --- | --- |
| `check-config.mjs`: City layers and fields, precinct count | done | #87 (PR #142) |
| `check-config.mjs`: voting location count vs the City Board's 56 | done, as a WARN | #87 (PR #142) |
| `check-config.mjs`: early voting hours match config | done, a FAIL | #91 (PR #149) |
| `check-config.mjs`: City wait time freshness | done | #106 (PR #138) |
| `check-config.mjs`: sample ballot links | skipped: #92 is blocked | none |
| `record-fixtures.mjs` City layers, City fixtures in `docs/raw/fixtures/` | done | #87, #88, #89, #90, #91 |
| `inspect-data.mjs`: City layers | **gap** | this PR |
| `e2e/fixtures.js`: City queries from fixtures, all else blocked | done | #89 (PR #148), #90 (PR #159), #91 (PR #149), #106 (PR #138) |
| `e2e/a11y.e2e.js`: City results route at 360 and 1280 px | done | #89 (PR #148), #90 (PR #159), #91 (PR #149) |
| `e2e/failures.e2e.js`: City layers failing | done | #89 (PR #148), #106 (PR #138) |
| `e2e/lighthouse.js`: a City results route under the budgets | **gap** | this PR |
| `scripts/smoke.mjs`: hard load of a City `/p/` route | **gap** | this PR |
| `check-geocoder.mjs`: City addresses | done | #88 (PR #145) |
| README: City data sources | done | #87 to #93 |
| README: City steps in "Updating for a new election" | mostly done (#89, #90, #91); step 2 (inspect) names only the county | this PR |
| README checklist: confirm the City's Election Day rule and early voting hours | done (step 3) | #89, #91 |

## Acceptance criteria

1. `e2e/lighthouse.js` measures `/p/W01P12` (the fixtures' City precinct, `CITY_CODE`)
   under the same budgets (median score 90+, median LCP under 2500 ms, every run shows the
   page's content). "Content" there is: the `Precinct W01P12` heading, no alert, the City
   Board's Election Day rule, each nearest polling place's real name, and the districts card.
   The budgets are not changed.
2. `scripts/smoke.mjs` checks that a hard load of `/p/W01P12` returns the app shell (same
   script as `/`, not pre-rendered), and a stub host that answers it with the pre-rendered
   home page fails only that check (`src/test/smoke.test.js`). In `--preview` mode the
   noindex check is unchanged.
3. `scripts/inspect-data.mjs` also inspects the City Board's layers named in
   `election.jurisdictions.city.layers` (and the City wait layer is the sites layer): each
   layer's schema, count and 3 sample rows, asking only for the fields the app reads,
   never `*` (the districts and sites layers hold officeholder and staff contact details).
   A test checks the City requests never ask for `*` and ask for exactly the configured
   fields. It writes `docs/raw/city_<key>.json`.
4. README: the Performance section lists the City route and its content check; the Smoke
   test section lists the City deep link; step 2 of "Updating for a new election" says the
   script inspects the City layers from config. Every other task box is already true on
   main and listed in the PR with the PR that did it.
5. Nothing collects, logs or transmits a voter address or location; no budget, test or
   check is loosened.

## Files that change

- `e2e/lighthouse.js`: a City route entry; `measure` passes each route's own code to `shows`.
- `scripts/smoke.mjs`: `CITY_DEEP_LINK = '/p/W01P12'` and its check after the County one.
- `src/test/smoke.test.js`: the expected check list gains the City line; a stub option
  `cityDeepLink: 'home'` and a test that only the City check fails.
- `scripts/inspect-data.mjs`: an exported `cityLayerRequests(config)` and a City pass in
  `main`, guarded so importing the module runs nothing.
- `src/test/inspectData.test.js` (new): the City requests' fields.
- `docs/raw/city_*.json` (new): one live run's output, if the City org answers.
- `README.md`: the lines above.

## Order of work

1. Plan commit.
2. Smoke: test first (red), then script.
3. inspect-data: test first (red), then script; run it live once.
4. Lighthouse: add the route, build, run `npm run test:perf`, record the numbers.
5. README.
6. Full gate.

## Risks

- The City route may miss LCP (the County route sits near 2436 ms in CI, #156). If so,
  diagnose; a small fix in the #151 pattern is in scope, anything larger goes to the owner.
- `inspect-data.mjs` asking for `*` on City layers would dump officeholder and staff contact
  details into the repo: the test guards it.
- Making `inspect-data.mjs` importable must not change what `node scripts/inspect-data.mjs`
  does for the county.

## Proof

- Criterion 1: `npm run test:perf` output listing `/p/W01P12` with score and LCP, PASS.
- Criterion 2: `src/test/smoke.test.js` (red before the script change, green after).
- Criterion 3: `src/test/inspectData.test.js` (red before, green after) and a live run.
- Criterion 4 and 5: the diff; the full gate.
- Live drive: `npm run preview` then `npm run smoke -- http://localhost:4173 --skip-headers`
  shows the City check passing.
