# Plan: Footer: link the County's official results site; wait times page: link the County turnout dashboards (issue #224)

Risk tier: Medium. Two new static links read from the election config, rendered in the footer
(every page, pre-rendered too) and on the wait times page; no data fetched, no auth, no
sending. Raised from Low because it touches more than a few files (config, copy, two
components, tests, README); every behavior is unit-testable.

Domain skills:
- superpowers:test-driven-development: invoke.
- vercel-react-best-practices: not applicable because the change adds two static links to
  existing components, with no rendering, data fetching or bundle concern (two short strings).
- frontend-design: not applicable because the links reuse `TextLink` and the existing footer
  and Sources section layout; no new visual direction.
- chrome-devtools-mcp:a11y-debugging: not applicable because `npm run test:e2e` (axe, 44 px
  targets, focus) covers the footer on every route and the wait times page.

## Acceptance criteria

1. The footer, on every page, lists a link to the St. Louis County Board of Elections' results
   site with the label "St. Louis County Board of Elections election results", after the two
   board links. Its href is `https://stl.tally-enr.com/#election=a3c1db39-6def-4ac8-b9bd-b33592113c8a`
   exactly: the election only, no `bucket`, `filter`, `contest` or `card` parameter. The
   label names the County Board only and no City results.
2. The results link has a 44 px target and prints with its address, like the board links.
3. The results URL lives only in `src/config/election.js`, County block, as
   `results.siteUrl`, with `results.sources` (the results API's County election list, where the
   ID was read) and `results.lastVerified`. A config test fails when `siteUrl` is not the
   Tally ENR site with exactly one `election=<uuid>` hash parameter.
4. The wait times page, in its Official sources section (early voting and Election Day alike),
   links `https://experience.arcgis.com/experience/178545eb8cd0450fbd5de996adcc00ef` with the
   label "St. Louis County Board of Elections unofficial turnout dashboards", in its own line
   ("Turnout so far: <link>.") after the County and City source links, since the dashboards
   are not a source of the line counts. The URL lives only in the config (`results.turnoutUrl`, County block).
5. The daily link check (`configLinks` in `scripts/check-content-links.mjs`) lists both URLs and
   the results source; a test proves it.
6. The election hardcoding test collects both URLs, so neither can be written outside the config.
7. README "Updating for a new election" step 3 says to replace the results election ID (read
   from the results API's election list) and the turnout dashboards link; the README footer
   note no longer says the footer links only the two boards.
8. Not done, and said so in the PR: a City results link (the City Board's results page was not
   checked, as the issue says), and showing results in the app (out of scope in the issue).

## Files that change

- `src/config/election.js`: County block `results: { siteUrl, turnoutUrl, sources,
  lastVerified }`, with a comment on why the link names the election only and why it is
  County only; typedef line.
- `src/i18n/en.json`: `footer.countyResults`, `footer.officialSites` becomes "Official election
  offices and results" (the list now holds a results site), `waitTimes.turnoutLink`.
- `src/components/siteFooterCopy.js`, `src/components/SiteFooter.jsx`: third list item.
- `src/features/waitTimes/waitTimesCopy.js`, `src/features/waitTimes/WaitTimesPage.jsx`
  (`Sources`): the turnout link.
- Tests: `src/components/SiteFooter.test.jsx`, `src/config/election.test.js`,
  `src/features/waitTimes/WaitTimesPage.test.jsx`,
  `src/features/waitTimes/WaitTimesPage.electionDay107.test.jsx` (the Election Day view),
  `src/test/checkContentLinks.test.js`,
  `src/test/election-hardcoding.test.js`.
- `README.md` (Phase 8), `docs/data.md` only if its text becomes wrong.

## Order of work

1. Config: failing config test for `results` (shape, the election-only URL, sources,
   lastVerified), then the config block. Hardcoding test asserts both URLs are collected.
   Link check test asserts `configLinks(election)` includes both.
2. Footer: failing test (link, href, 44 px, printed, label names the County Board and not the
   City), then copy and component.
3. Wait times: failing test (link in both modes), then copy and component.
4. Gate, live drive, docs.

## Risks

- The footer is pre-rendered into every static page and hydrated: the new link must render the
  same in Node and the browser (it reads only the config, so it does). `npm test` renders every
  path; e2e checks hydration.
- Perf budget: two short strings in the first load; negligible.
- Nonpartisan rule: a contest-specific URL would put one race first. Guarded by the config test.
- A wrong label could suggest City results: the label names the County Board, and a test checks
  it does not say "City".
- Riskiest step: the footer list label change, which other tests or e2e may look up by name.
  Grep for `officialSites` and "Official election offices" before changing it.
- Chose not to: add a live check that the ID is in the API's list (the link check covers the
  pages answering; the README step covers re-reading the ID), or add a City results link.

## Proof

- AC1, AC2: `SiteFooter.test.jsx`. AC3: `election.test.js`. AC4: `WaitTimesPage.test.jsx`
  (early voting) and `WaitTimesPage.electionDay107.test.jsx` (Election Day). AC5: `checkContentLinks.test.js`. AC6:
  `election-hardcoding.test.js`. AC7: Phase 8 review.
- Live drive: `npm run build && npm run preview`; in a browser, the footer on `/`, `/learn` and
  a precinct page shows the results link opening Tally ENR on the November 3, 2026 General
  Election with no contest selected; `/early-voting` shows the turnout dashboards link; both
  open the right pages.
