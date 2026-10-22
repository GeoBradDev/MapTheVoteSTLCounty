# Plan: Wait time readiness: health check reports fresh waits, plus fixtures for e2e (issue #106)
Risk tier: High. Forced: it changes a scheduled job (`.github/workflows/data-health.yml`). It
also changes the health check's exit rules (a new WARN status) and adds browser tests of
stateful UI. Plan approval: the coordinator runs this batch unattended and asked for the work
to keep moving (early voting ends November 2); owner decisions go to the issue instead.
Domain skills: superpowers:test-driven-development: invoke. vercel-react-best-practices: not
applicable because no React code changes. chrome-devtools-mcp:a11y-debugging: not applicable
because no UI changes; the new e2e tests run axe on the failure state. dataviz,
frontend-design: not applicable because nothing is drawn.

Also covers #132 (health check of the wait time layers and their fields): its three tasks
are tasks 1 and 2 below. The PR says `Closes #132`.

## Acceptance criteria
1. `node scripts/check-config.mjs` checks each enabled wait source in `election.waitTimes`:
   the layer metadata (`?f=json`) answers and has `siteField`, `valueField`, `timeField`, and
   for the City also `hoursField` and `commentsField`. A missing field or a broken layer is a
   FAIL naming the config key, the layer path and the field.
2. It then reads each source's rows and prints one line per source that names the board and
   says whether the source is fresh, closed, or open with no fresh report:
   - County: how many early voting sites are open now (by `earlyVoting.schedules`), how many
     of them have a report the app would show now, how many reports match no site (a join
     problem, by `pollsField`), and the newest report time in Central time. An empty view is
     normal while sites are closed.
   - City: how many early voting rows have a `waittime`, how many are open now by their
     hours field, how many the app would show now, and the newest report time from
     `timeField` (`created_date_*`, never `last_edited_date`).
   "Would show now" uses the app's own `selectCountyWaits` and `selectCityWaits`.
3. Sites open with nothing fresh, or County reports that match no site, are a WARN, not a
   FAIL: WARN prints, never changes the exit code, and is listed on the workflow run's
   summary page (via `--warnings <file>`) and in any failure issue the run opens.
4. `data-health.yml` keeps the daily 12:00 UTC run and adds a run every 2 hours from 14:00 to
   22:00 UTC (9 a.m. to 5 p.m. Central in daylight time, 8 a.m. to 4 p.m. after). Those extra
   runs check only the election config (wait times included), and only on a day inside the
   config's early voting dates (first `from` to last `to` across `earlyVoting.schedules`), so
   they stop after November 2 with no edit. Election Day runs are #107.
5. The workflow's Election window step runs before `npm ci`, so it imports only a module with
   no package imports: a new `scripts/electionWindow.mjs`. (On main it imports
   `check-config.mjs`, whose import chain reaches `react` since #103, so the step fails
   before `npm ci` and every scheduled run would open a false data health issue.) A test
   checks that module and the config import nothing outside the repo.
6. `e2e/fixtures.js` answers both wait layers from fixtures, with fresh, stale or empty per
   source chosen per call (`fixtureBody(href, form, { waits })`); the default stays as today
   (County fresh, City stale). County stale is the fresh fixture with each report time
   moved back past `maxAgeMinutes`; empties are a features list with no rows.
7. `e2e/failures.e2e.js` covers the /early-voting page with County waits fresh (counts show),
   stale and empty (every site says no current count, the checked line shows), HTTP 503,
   network error and a timeout (the page, the site list and the official links still render
   and the line says counts could not be loaded), and a City failure that leaves County counts
   shown. No test reaches the network; axe runs on the failure state.
8. README: the Data health check section describes the wait checks, WARN and the open-hours
   runs; the Election config section gets a short runbook for the first day wait data
   appears (values match the board's own map, times are Central, units are people).

## Files that change
- `scripts/electionWindow.mjs` (new): `isPastElection` (moved), `isEarlyVotingPeriod`,
  `windowFor(config, event, now)` returning `full`, `waits` or `off` for the workflow.
- `scripts/check-config.mjs`: re-export `isPastElection`; WARN status; `now` and wait checks;
  absentee query also asks for `pollsField` and keeps the sites; `--warnings <file>`.
- `src/test/checkConfig.test.js`: stub answers the two wait orgs; tests for every new check,
  the warnings file, `parseArgs`, the window and the workflow shape.
- `.github/workflows/data-health.yml`: the extra cron, the window step via
  `electionWindow.mjs`, the config step writes warnings, summary lists them, geocoder and link
  checks only on `full` runs, the failure issue includes warnings.
- `e2e/fixtures.js`, `e2e/failures.e2e.js`.
- `README.md`, `docs/progress.md` (the coordinator's #104 line).

## Order of work
1. Tests then code for `electionWindow.mjs` and its import guard.
2. Tests then code for the wait layer field checks (task 1, #132).
3. Tests then code for the report checks, WARN, `--warnings`.
4. Workflow and its tests.
5. e2e fixtures and failure tests; run `npm run build && npm run test:e2e`.
6. README, progress line.
7. Live run of `node scripts/check-config.mjs` during open hours.

## Risks
- WARN must never fail the run (a closed site is normal) and FAIL must still fail. Tested.
- A bad window step would silently stop every scheduled check; tested by running the module
  logic and checking its import list.
- More scheduled runs mean more comments on an open data health issue (up to 6 a day during
  early voting). Accepted: a broken wait source during voting is worth the noise.
- The County view keeps only 2 hours of reports, so a stale County fixture is synthetic
  (shifted times). Said so in the fixture comment.
- City sites are not listed on the page yet (#91), so City fixtures only prove the page
  survives City data in every state; City counts on screen come with #91.

## Proof
- Criteria 1 to 5: `src/test/checkConfig.test.js` (`npm test`).
- Criteria 6 and 7: `e2e/failures.e2e.js` and the existing a11y run (`npm run test:e2e`).
- Criterion 2 live: `node scripts/check-config.mjs` during County open hours prints the
  County line as fresh with its counts, and the City line.
- Criterion 5 live: the window module runs with no `node_modules` (copy of `src` and
  `scripts` in a scratch directory).
