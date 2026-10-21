# Plan: Data health check script for election config (issue #28)

Risk tier: High. Forced by the scheduled (cron) job, which also opens issues on the repo. The
script itself is developer and CI tooling: it never ships in the app bundle and changes no app
behavior. The plan was not approved interactively: this run was delegated with an instruction to
make low-stakes calls and record them in the PR.

Domain skills: none apply. No React, UI, API server, payments or email change; the only outward
action is the workflow opening a GitHub issue, which is covered by the plan's own review.

## Acceptance criteria

1. `node scripts/check-config.mjs` reads `src/config/election.js` and, against the live layers:
   1. every configured layer (`precincts`, `polls`, `countyBoundary`) answers its `?f=json`
      info request, has the geometry type the app expects and every field the app reads;
   2. the precinct count is in a sane range (900 to 1600; 1213 today) and at least one
      precinct is `In Election`;
   3. every `In Election` precinct's `html` parses with the app's `parseSampleBallot` to a
      link matching the config's pattern, with a file name and not shared with another
      precinct, and every other precinct parses to a message (the checks of
      `scripts/check-sample-ballots.mjs`, which this script replaces);
   4. 5 random sample ballot links answer a `HEAD` request with `Content-Type: application/pdf`;
   5. the absentee filter (`absenteeWhere`) returns at least one site, and each site's
      `abs_type` has hours in `earlyVoting.schedules`;
   6. one known point per County Council district (7) returns a precinct with a valid code
      and that council district, and lies inside the county boundary layer; one point in
      St. Louis City returns no precinct and lies outside the boundary.
2. It prints one PASS, FAIL or SKIP line per check (SKIP when a check it needs input from
   failed; the PDF spot-check still runs on the valid links when some precincts' links fail)
   and exits 1 unless every check passes. A query answer with no features list fails the
   check rather than counting as empty.
3. Pointing the config at a wrong layer name makes the check fail with a clear message that
   names the config key, the layer path and the service's error. Shown by a unit test with a
   stubbed service and live with `--layer precincts=<wrong path>`.
4. A transient failure (network, timeout, 429, 5xx) is retried before a check fails.
5. A GitHub Actions workflow runs the check daily and on demand; scheduled runs skip (passing)
   once the Chicago date is after `electionDate`, while a manual run always checks. It also
   runs `scripts/check-geocoder.mjs`, and on any failure opens an issue labeled `data health`, or comments on the open one, with a link to
   the run. It never runs on pull requests, so a live outage can never block a merge.
6. Unit tests cover the checks with a stubbed `fetch`, run in `npm test` with no network.
7. Docs: README gets a "Data health check" section; `docs/data.md` points to the new script
   instead of `check-sample-ballots.mjs`.

## Files that change

- `scripts/check-config.mjs` (new): `runHealthCheck(config, options)` returning check
  results, `parseArgs`, `isPastElection`, and a `main` guarded like `scripts/smoke.mjs`.
- `scripts/check-sample-ballots.mjs` (deleted): folded into the new script.
- `src/test/checkConfig.test.js` (new): unit tests, node environment, stubbed fetch.
- `.github/workflows/data-health.yml` (new): the scheduled job.
- `README.md`, `docs/data.md`: docs as above.

Not touched: `scripts/check-geocoder.mjs`, `src/data/photon.js`, `src/data/geocoder.js`,
`render.yaml`, `privacyCopy.js` (issue #49 owns them). The workflow only calls
`node scripts/check-geocoder.mjs` with no arguments.

## Order of work

1. Tests for the layer info check, including the wrong layer name criterion (red), then the
   implementation.
2. Tests and implementation for the precinct count and sample ballot checks, then the HEAD
   spot-check, the absentee check and the known points.
3. Retry, `parseArgs` (`--layer key=path`), `isPastElection`, and the CLI. The workflow's
   "Election window" step calls `isPastElection` itself, so the script needs no `--scheduled`
   flag (changed during review: one gate in one place).
4. Delete `check-sample-ballots.mjs`; the workflow; docs.
5. Gate, then a live run, and a live run with a wrong layer name.

## Risks

- Live data changes legitimately (a precinct split, a renamed field). The check then fails and
  opens an issue, which is the point; the thresholds are constants at the top of the script.
- The known points are polling places at public buildings. Council districts change only with
  redistricting; if the county redraws them, update the table.
- Flaky public services (Photon especially) can open an issue on a transient outage. Retries
  reduce this, and the workflow comments on one open issue instead of opening a new one each
  day. Because the workflow has no `pull_request` trigger, it can never block a merge.
- The workflow needs `issues: write`. It runs only on `schedule` (default branch) and
  `workflow_dispatch`, which needs write access to the repo, so no fork code runs with that
  token. Checkout does not persist the token, so `npm ci` install scripts cannot read it.
- `parseSampleBallot` reads the pattern from the real config, so a `--layer` override does not
  change the pattern. Acceptable: overrides are for testing layer paths.

- A slow service could push the job past its timeout, which cancels it without an issue.
  Requests time out after 15 s with 3 tries, and the job allows 45 minutes, above the worst
  case of about 40 (changed during review).

Chosen not to do: no check of map tiles, Photon or the county website (the geocoder has its own
script); no change to `scripts/inspect-data.mjs`, which is a raw dump for docs, not a pass/fail
check.

## Proof

- Criteria 1 to 4, 6: `src/test/checkConfig.test.js` (stubbed services: all healthy, wrong
  layer name, missing field, wrong geometry, count out of range, bad ballot link, HEAD not PDF,
  no absentee sites, missing schedule, known point in the wrong district or outside, retry on
  503, past election skip, argument parsing).
- Criterion 1 to 3 live: `node scripts/check-config.mjs` output, and
  `node scripts/check-config.mjs --layer precincts=precincts_2026_11_viewX/FeatureServer/1`
  failing with the clear message.
- Criterion 5: workflow YAML parsed in a test (triggers, no `pull_request`, permissions,
  failure step), and a manual `workflow_dispatch` run after merge is out of reach from the
  branch, so the PR says how to trigger it.
- Criterion 7: the doc diff.
