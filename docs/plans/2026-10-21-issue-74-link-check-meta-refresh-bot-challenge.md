# Plan: Link check misses meta-refresh redirects and the county site's 403 bot challenge (issue #74)

Risk tier: High. Forced: the change is to a scheduled job (the daily data health workflow and
the script it runs). The code itself is a monitoring script, unit-testable with a stubbed
fetch, and changes no app behavior. Plan approval: the owner's coordinator asked for this
issue to be taken to a merged PR without a pause, so that request stands as approval.

Domain skills: superpowers:test-driven-development: invoke. vercel-react-best-practices: not
applicable because no React code changes. frontend-design, a11y-debugging: not applicable
because no UI changes. django, fastapi, expo: not applicable because the repo uses none.

## Acceptance criteria

1. For a `text/html` 2xx answer, the checker reads at most 512 KB of the body and finds a
   `<meta http-equiv="refresh" content="N; url=...">` (attributes in either order, any letter
   case, quoted or not). When the target, resolved against the final URL, is a different page
   (a different origin, path or query; the fragment is ignored), the URL fails with
   `meta refresh to <target>`. A refresh with no URL, or to the same page, passes.
2. Run live, the checker fails a page of the board's retired site (which #73 removed from the
   app, so it is checked by hand in the live drive) with
   `meta refresh to https://stlouiscountymo.gov/...`.
3. The URLs in `src/config/election.js` are checked by `scripts/check-content-links.mjs`:
   `countySiteUrl`, `officialLookupUrl`, every `sources` entry and any other key ending in
   `Url` or `Source` (today `phoneSource`), but not `serviceRoot`, which `check-config.mjs`
   already covers through its layers. Each is reported with `src/config/election.js (<key>)`.
4. A `403` with a bot-challenge marker (a `cf-mitigated: challenge` header, or a body naming
   `challenges.cloudflare.com` or `/cdn-cgi/challenge-platform/`) is reported as
   `SKIP <url>: bot challenge, check by hand in a browser`, is not retried, and does not make
   the script exit 1. Any other `403` still fails.
5. Skipped URLs are listed in the issue the workflow opens on a failure, and in the run's job
   summary every day, so they are never passed silently.
6. CI makes no live requests: the check stays in the scheduled workflow only; unit tests use a
   stubbed fetch.

## Files that change

- `scripts/check-content-links.mjs`: `metaRefreshTarget(html, baseUrl)`, `isBotChallenge(res,
  body)`, a capped body reader, `configLinks(config)`, `skip` status, `--skipped <file>` flag
  that writes one skipped URL per line.
- `src/test/checkContentLinks.test.js`: fixtures from the issue.
- `src/test/checkConfig.test.js`: the data health workflow test also checks that skipped links
  reach the job summary and the failure issue.
- `.github/workflows/data-health.yml`: pass `--skipped "$RUNNER_TEMP/skipped-links.txt"`,
  write skipped URLs to `$GITHUB_STEP_SUMMARY`, and add them to the issue body.
- `README.md`, `docs/data.md`: describe the new checks; drop "#74 tracks".

## Order of work

1. Red tests: meta refresh off-host fails, same-page refresh and URL-less refresh pass, 403
   challenge skips (header and body), plain 403 fails, config URL that refreshes away fails,
   `configLinks` picks the right keys.
2. Implement in the script until green.
3. Workflow and docs.

## Risks

- A page whose body has a `noscript` meta refresh to a no-JS page would fail. Accept: a person
  reads the FAIL detail; none of today's links does this (live drive shows it).
- Reading bodies makes each check slower; capped at 512 KB, and only for `text/html`.
- Skips are permanent for the county site, so a skip alone does not open an issue (it would
  open one every day for a page the owner checked by hand). It shows in the job summary and in
  any failure issue.
- JavaScript `location` redirects are not detected: a pattern match on script text would give
  false failures. Not done.

## Proof

- Unit tests in `src/test/checkContentLinks.test.js` cover criteria 1, 3, 4 and the
  `--skipped` output.
- Live drive: run `node scripts/check-content-links.mjs` and see the county site as SKIP and
  everything else PASS; run `checkLinks` against a retired-site URL and see the meta refresh
  failure (criterion 2).
- `.github/workflows/ci.yml` unchanged and the data health workflow keeps no pull_request or
  push trigger (criterion 6).

Revision: the red test first used the real `countySiteUrl` as a fixture target, which
`src/test/election-hardcoding.test.js` forbids outside the config. The fixture now uses
`https://board.gov/elections/`; what it asserts is unchanged. At the merge base the rewritten
test still fails (the exports it imports do not exist there, and the meta refresh is passed).
