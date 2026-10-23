# Plan: Jurisdiction-neutral site name, copy and official links (issue #93)

Risk tier: Medium. Copy and link changes across many files, altering existing text; every
change is a rendered string or link a unit test can check, and no data, request or privacy
behavior changes. The file count is mostly tests that pin the old site name.

Domain skills: humanizer: invoke (all new copy). frontend-design: not applicable because no
layout or visual change, only text and one more link in existing lists.
vercel-react-best-practices: not applicable because no rendering or data-loading change.
test-driven-development: invoke.

Owner decision (2026-10-23, on the issue): the site name is "St. Louis Voter Guide".

Already done before this run (not redone): the footer and the privacy intro name both boards
(#71); the privacy notice describes the City's election maps and geocoder (#88, #89); City
results cards read the City's board and lookup (#89 to #91); the home page's County Election
Day rule says it does not apply in the City (#152); the City results page test asserts no
County text (#89). The learn topics themselves are County-sourced; City topics are #94.
`/early-voting` copy is left to #107, which is editing it now. No web manifest exists yet
(#25), and robots.txt and sitemap.xml do not name the site.

## Acceptance criteria

1. The site name is "St. Louis Voter Guide" in `index.html`'s title, `site.name`, every tab
   title pattern (`site.pageTitle`, `results.pageTitle`, `results.notFoundTitle`,
   `learn.pageTitle`), the home heading, `og:site_name` and the pre-rendered pages, and the
   README's opening.
2. The meta description (`site.description`, `index.html`) says the guide is for St. Louis
   City and County voters.
3. The home page's "More information" lists both boards' websites.
4. Where no jurisdiction is known, the fallback names both boards' lookups: the home page
   lookup error, the error screen on any page that is not a precinct page, and the precinct page for a value that is not a precinct code. The home
   lookup error "failed" message does not say "the county's precinct map".
5. The learn page's intro does not say the site is County-only: it says the guides are from
   the County Board for now and points City voters to the City Board; "More help" and the
   empty state list both boards' websites.
6. The privacy notice's "Links to other sites" says "like the election boards'", not "the
   county's".
7. A County voter's results page is unchanged apart from the site name; a test fails if a
   County results page names the City Board or links its site (the City page already has
   the reverse test).

## Files that change

- `src/i18n/en.json`: the name, description, new `officialLookups` keys (county, city, or),
  `home.citySite`, `learn.citySite`, `learn.empty.citySite`, `learn.intro`,
  `lookup.errors.failed`, `privacy.links.text`.
- `index.html`: title and description.
- `src/components/BothLookups.jsx` (new): "the <County lookup> or the <City lookup>".
- `src/components/ErrorBoundary.jsx`, `errorBoundaryCopy.js`: both lookups when the error is
  not on a County or City precinct page. On a County precinct page it keeps the County
  lookup (criterion 7). `App.jsx` passes the jurisdiction for `/p/<county code>` too.
- `src/features/lookup/AddressLookup.jsx`, `lookupCopy.js`: both lookups.
- `src/features/lookup/PrecinctPage.jsx`: both lookups when `jurisdictionFor(code)` is null.
- `src/features/lookup/HomePage.jsx`, `homeCopy.js`: City board link.
- `src/features/learn/LearnPage.jsx`, `learnCopy.js`: City board links.
- Tests and e2e that pin the old name or copy; `e2e/lighthouse.js`.
- `README.md`: name and the opening's audience, and the copy lines that say only "county's
  official lookup" where that is now both.

## Order of work

1. Tests first for criteria 3 to 7 (red), then the name tests updated to the new name.
2. en.json, index.html, then components.
3. Full gate, live drive of home, an invalid `/p/` code, `/learn`, `/privacy`, a County
   precinct page.

## Risks

- ErrorBoundary currently gets `city` only; on a County precinct page it must still show the
  County lookup, not both. Mitigation: App passes the County jurisdiction for county codes;
  tested.
- Pre-rendered HTML and build tests pin the title; update both and rebuild.
- #107 edits en.json in parallel: rebase and keep both.

## Proof

- Criterion 1: App, pageHead, build and prerender e2e tests on the new name.
- Criterion 2: pageHead test on the description.
- Criteria 3, 5: HomePage and LearnPage tests for both board links.
- Criterion 4: AddressLookup.errors18, ErrorBoundary and PrecinctPage tests for both links.
- Criterion 6: PrivacyPage test.
- Criterion 7: new PrecinctPage test (County page, no City board text or link); existing
  County tests unchanged except the name.
- Live drive: home, `/p/nope`, `/learn`, `/privacy`, `/p/CC007` in the browser show the above.
