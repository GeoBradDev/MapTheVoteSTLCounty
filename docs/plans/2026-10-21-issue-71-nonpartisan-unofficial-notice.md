# Plan: Tell voters this is a nonpartisan, unofficial resource (issue #71)

Risk tier: Medium. Copy and static markup only, but it changes existing footer behavior
(print), touches several files, and the print and above-the-fold criteria need a real
browser to check. Plan approval: the run is autonomous; the issue's task list is the
approved scope, and the final wording waits on the owner before merge (issue criterion).

Domain skills:

- vercel-react-best-practices: not applicable because the change is static markup with no
  data fetching, state or bundle impact.
- frontend-design: not applicable because it reuses the existing footer, tokens and link
  styles.
- chrome-devtools-mcp:a11y-debugging: not applicable because the Playwright axe run in
  `e2e/a11y.e2e.js` already audits every route, footer included.

## Acceptance criteria

1. Every route (`/`, `/p/:precinct`, `/learn`, `/learn/:topic`, `/privacy`, the not found
   page and the error boundary's page) shows, in the `<footer>` landmark, that the site is
   nonpartisan, unofficial and not affiliated with the St. Louis County Board of Elections
   or the St. Louis City Board of Election Commissioners (owner comment: City parity), with
   working links to both boards' sites: the County link's `href` is
   `election.countySiteUrl`, the City link's is `referrals.stlCityBoard.url`. No hardcoded
   URL.
2. Each footer link is at least 44px tall (`min-h-11`), like the Privacy link.
3. The home page shows a one-line independent, nonpartisan statement in its header, and at
   360px wide the line and the address box are both above the fold.
4. The statement (and the official links) print; the Privacy link does not.
5. The Privacy page intro opens with a sentence that agrees with the footer statement.
6. `index.html` has a `<meta name="description">` that includes "nonpartisan" and
   "unofficial" and no election-specific value.
7. The new copy lives in copy files and names no party or candidate (tests).
8. Owner approves the final wording before merge.

## Files that change

- `src/components/siteFooterCopy.js` (new): the footer statement and link labels.
- `src/components/SiteFooter.jsx`: the statement, the two official links, Privacy link
  print-hidden instead of the whole footer.
- `src/components/SiteFooter.test.jsx` (new): copy, hrefs, print classes, no party names,
  footer on the error boundary's page.
- `src/App.test.jsx`: the per-route footer test also checks the statement and both links.
- `src/features/lookup/homeCopy.js`, `HomePage.jsx`: the home line under the intro.
- `src/features/lookup/HomePage.test.jsx`: the line renders.
- `src/features/privacy/privacyCopy.js`: an about sentence at the start of the intro.
- `index.html`: the meta description.
- `src/index.css`: the print comment (footer no longer hidden as a whole).
- `src/test/build.test.js`: its comment and a check that the built `index.html` carries the
  description.
- `e2e/a11y.e2e.js`: home line and address box above the fold at 360 x 640; printed
  results page shows the statement and hides the Privacy link.

## Order of work

1. Tests for the footer (red), then the footer and its copy.
2. Home line test, then copy and markup.
3. Privacy intro sentence.
4. Meta description test (build test), then `index.html`.
5. e2e checks; print comment.

## Risks

- A second "St. Louis County Board of Elections website" link on pages that already show
  one: tests that query by that name globally on the full App would find two. Unit tests
  render pages alone; the App test queries within the footer.
- The election hardcoding test scans `index.html`: the description must not hold a date,
  URL or election name.
- Above the fold at 360px: keep the home line short, one sentence.
- Not done: naming who runs the site (owner's open question); README disclaimer (#29);
  per-route descriptions and Open Graph (#98); header/footer layout (#79).

## Proof

- Criterion 1, 2, 7: `src/App.test.jsx` per route; `src/components/SiteFooter.test.jsx`.
- Criterion 3: `HomePage.test.jsx` (renders) and `e2e/a11y.e2e.js` (above the fold).
- Criterion 4: `e2e/a11y.e2e.js` print emulation; `build.test.js` keeps the print styles.
- Criterion 5: `SiteFooter.test.jsx` checks the privacy intro names the site nonpartisan
  and both boards; whether it agrees in wording is part of criterion 8.
- Criterion 6: `build.test.js` on the built `index.html`.
- Live drive: build, preview, view `/` at 360px and a results page in print emulation.
