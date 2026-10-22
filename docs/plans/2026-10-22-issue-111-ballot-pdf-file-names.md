# Plan: Health check: compare the sampled sample ballot PDFs' file names with their precincts (issue #111)

Risk tier: Low. One live-check script plus its unit tests and docs; the change is fully
exercised by stubbed-fetch unit tests, touches no app code, no UI, no schema.

Domain skills: superpowers:test-driven-development, invoke. Frontend, React, accessibility,
dataviz skills: not applicable because no UI or app code changes. Django, FastAPI, Expo:
not applicable because the repo is a static Vite site.

## Acceptance criteria

1. The "sample ballot PDFs" check fails, naming the precinct, when a sampled link's
   response `Content-Disposition` file name names another precinct (compared with
   `fileNameMatchesPrecinct`).
2. It also fails, naming the precinct, when a sampled response has no
   `Content-Disposition` file name.
3. The real header form `attachment; filename="CC-007.pdf"; size=55289` parses to
   `CC-007.pdf`; `filename*=UTF-8''...` is honored over `filename=`.
4. Existing failures (not a PDF, HTTP error) still fail, now also naming the precinct.
5. Sample size decision recorded: the daily run keeps 5 random links; a new
   `--ballot-sample <n|all>` option lets someone check more, or every link, by hand.
6. Tests in `src/test/checkConfig.test.js`; README and `docs/data.md` say what the check does.

## Files that change

- `scripts/check-config.mjs`: `contentDispositionFileName(header)` export; the links check
  keeps `{ precinct, url }` pairs; the PDFs check compares the file name; `ballotSample`
  option on `runHealthCheck`; `--ballot-sample` in `parseArgs` and `main`.
- `src/test/checkConfig.test.js`: stub HEAD answers with a `content-disposition` named for
  the URL's precinct; new tests for mismatch, missing header, parser forms, option parsing,
  `all`; the existing HEAD test's expected detail gains the precinct.
- `README.md` (Data health check), `docs/data.md` (sample ballot section).

## Order of work

1. Red tests for the parser, the mismatch and missing cases, the option.
2. Implement in `scripts/check-config.mjs`.
3. Docs.

## Risks

- A header form the parser does not know reads as missing and fails the check: a false
  alarm, not a silent pass. Verified live: the portal answers
  `attachment; filename="CC-007.pdf"; size=55289`.
- `--ballot-sample all` sends one HEAD per link (974) to the county portal; it is for a
  manual run only, the workflow is unchanged.

## Sample size decision

Keep 5 daily. The "sample ballot links" check already compares every link's text with its
precinct; this check guards the text and the served file diverging, most likely all at
once (a re-publish), which 5 random links catch. Checking all 974 daily would multiply
load on the county's portal and blow the workflow's step limit in the worst case
(3 tries of 15 s per request). `--ballot-sample all` covers a full sweep before Election Day.

## Proof

- Unit tests: criteria 1 to 5 (stubbed fetch).
- Live drive: `node scripts/check-config.mjs` passes against the live layers, and
  `--ballot-sample all` passes (run: 974 of 974 named for their precinct, 3 min 37 s).
