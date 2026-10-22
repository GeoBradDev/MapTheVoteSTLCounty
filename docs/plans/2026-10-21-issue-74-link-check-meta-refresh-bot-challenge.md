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
   case, quoted or not, a `>` inside a quoted value, the first of a repeated attribute, as a
   browser reads it; tags in comments, scripts and `noscript` blocks and a refresh with no
   delay are ignored). When the target, resolved against the final URL, is a different page
   (a different origin, path or query; the fragment is ignored), the URL fails with
   `meta refresh to <target>`. A refresh with no URL, or to the same page, passes.
2. Run live, the checker fails a page of the board's retired site (which #73 removed from the
   app, so it is checked by hand in the live drive) with
   `meta refresh to https://stlouiscountymo.gov/...`.
3. The URLs in `src/config/election.js` are checked by `scripts/check-content-links.mjs`:
   `countySiteUrl`, `officialLookupUrl`, every `sources` entry and any other key ending in
   `Url` or `Source` (today `phoneSource`), but not `serviceRoot`, which `check-config.mjs`
   already covers through its layers. Each is reported with `src/config/election.js (<key>)`.
4. A `403` with a bot-challenge marker (a `cf-mitigated: challenge` header, or Cloudflare's
   challenge page itself: a body that sets `_cf_chl_opt` or loads
   `/cdn-cgi/challenge-platform/h/.../orchestrate/`) is reported as
   `SKIP <url>: bot challenge, check by hand in a browser (HTTP 403) (<files>)`, is not retried, and does not make
   the script exit 1. Any other `403` still fails.
5. Skipped URLs, each with the files that use it, are listed in the issue the workflow opens
   on a failure, and in the run's job summary every day, so they are never passed silently. The
   skipped file is rewritten after each skip, so a step cut off by its timeout still lists the
   skips it found.
6. CI makes no live requests: the check stays in the scheduled workflow only; unit tests use a
   stubbed fetch.

## Files that change

- `scripts/check-content-links.mjs`: `metaRefreshTarget(html, baseUrl)`, `isBotChallenge(res,
  body)`, a capped body reader, `configLinks(config)`, `mergeLinks` (one entry per URL across
  topics and config), `skip` status, an `onResult` option on `checkLinks`, and a
  `--skipped <file>` flag (`parseArgs`, `writeSkipped`) that writes one line per skipped URL:
  `<url> (<files>)`.
- `package.json`, `package-lock.json`: `parse5` as a direct devDependency (already installed
  through jsdom at 8.0.1), so the meta refresh scan reads the page as a browser parses it.
  The data health workflow runs `npm ci` before the link check, so it is available there.
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

- The meta refresh scan first used patterns; two review rounds found pages a browser reads
  differently (abrupt comments, `<!--` in a script, text in a title or template, entities,
  two refreshes). It now parses the page with parse5 (scripting on, so `noscript` is text) and
  reads `content` by the HTML standard's declarative refresh steps: the first refresh a
  browser can parse is the only one that counts. A third round added the page's `<base href>`,
  an exact (ASCII case-insensitive, untrimmed) `http-equiv` match, URL-parser whitespace
  rules, and ignores a `javascript:` target, which browsers refuse.
- A refresh with a long delay (a session timeout such as `content="1200; url=/logout"`) to
  another page fails like any other. That is what criterion 1 says, and none of today's links
  has one (live drive). If one appears, a person reads the FAIL detail; a delay threshold is a
  follow-up, not done here.
- Cloudflare injects its detection script (`/cdn-cgi/challenge-platform/scripts/jsd/`) and
  Turnstile (`challenges.cloudflare.com`) into ordinary pages, including a real 403, so those
  alone do not make a skip (review round 4 narrowed the markers).
- An HTTP `Refresh` response header is not checked; the issue asks only for the meta tag.
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
