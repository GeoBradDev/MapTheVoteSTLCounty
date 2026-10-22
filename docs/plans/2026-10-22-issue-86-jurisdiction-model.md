# Plan: Jurisdiction model: per-jurisdiction config, precinct codes and routes (issue #86)

Risk tier: Medium. A behavior-preserving refactor across config, the results page and its
cards (more than a few files, a changed config shape, stateful UI), with nothing in the
forced-High list. The owner's brief (the coordinator's task, which carries the owner's
2026-10-22 route decision) stands as the plan approval.

Domain skills: superpowers:test-driven-development: invoke. vercel-react-best-practices:
invoke (React context and props in the results page). frontend-design: not applicable
because no UI or style changes. chrome-devtools-mcp:a11y-debugging: not applicable because
no markup changes for county pages; the e2e axe suite runs in the gate. dataviz,
django and the rest: not applicable because no charts or backend.

## Acceptance criteria

1. `src/config/election.js` holds shared election values (date, name, time zone, Election
   Day hours, layer max age, nearby count, wait times) and one block per jurisdiction,
   `county` and `city`, each with an `id`, a display `name`, its `board`, service root,
   layers, fields, official lookup URL, board site URL and sources. County values are
   unchanged.
2. No user-visible change for county voters: every existing test passes, with edits to
   imports only.
3. `/p/CC007` works as today. A well-formed City code (`^W\d{2}P\d{2}$`, like `W01P12`)
   reaches the City adapter, a stub until #87, and never asks the County's layers. The stub
   answers "not found" and links the City board's own lookup page, not the County's.
4. `w01p12` (letter case or spaces only) redirects to `/p/W01P12`, as `cc007` does today;
   malformed codes still show "Precinct not found" without echoing the URL text.
5. `shareUrl()` and the share link work for both shapes and carry only the code.
6. A test fails if a City layer or field name from the City block is written outside the
   config (extends `src/test/election-hardcoding.test.js`).
7. The City code shape and the single-route decision are recorded in `docs/data.md`, with
   the City layer's `precinctid` shape (`W <ward> P <precinct>`) confirmed against the live
   layer.
8. `PrecinctPage` and the results cards ask a jurisdiction adapter for the precinct, the
   polls, the early voting sites and the outline; the county adapter is today's code.
9. First-load JS stays under the 120 KB budget.

Analytics (#69) is not built yet, so there is nothing to redact today; `isPrecinctCode`
in `src/data/jurisdictions.js` is the one test #69 should use for both shapes (noted on the
PR).

## Files that change

- `src/config/election.js`: split into `shared`, `county`, `city`; named export
  `jurisdictions`; the default export stays the shared values plus the County block's,
  plus `jurisdictions`, so County-only callers and every test keep reading
  `election.serviceRoot` and friends. `countySiteUrl` stays as the County block's
  `boardSiteUrl` under its old name for those callers.
- `src/config/referrals.js`: the City board URL comes from the City block (one copy).
- `src/data/jurisdictions.js` (new): `CITY_PRECINCT_CODE`, `isPrecinctCode`,
  `jurisdictionFor(code)`, `cityPrecinctId(code)`, the county adapter (today's
  `arcgis.js` functions) and the City stub.
- `src/data/arcgis.js`: reads the County block (`jurisdictions.county`) rather than the
  top-level spread.
- `src/features/lookup/jurisdictionContext.js` (new): a React context whose default is the
  county adapter, so cards rendered alone (their tests) are unchanged.
- `PrecinctPage.jsx`: picks the adapter from the code shape, provides it, prefetches
  through it, links its official lookup; `canonicalCode` accepts both shapes.
- `PollsCard.jsx`, `EarlyVotingCard.jsx`, `PrecinctMap.jsx`, `useNearestSites.js`,
  `distanceOrigin.js`: read the adapter from context instead of importing county
  functions.
- `resultsCopy.js`, `src/i18n/en.json`: an official lookup label for a non-County
  jurisdiction, naming its board.
- Tests: `src/data/jurisdictions.test.js` (new), `PrecinctPage.test.jsx` (City code and
  lowercase redirect), `ShareLink.test.jsx` (City code), `election.test.js` (blocks),
  `election-hardcoding.test.js` (City block fields).
- Docs: `docs/data.md` (decision and City code shape), `README.md` (Election config
  section), `docs/progress.md` (#105 line from the coordinator).

## Order of work

1. Tests for `jurisdictions.js`, then the module; then config split and referrals.
2. Hardcoding test extension (red against a planted City field), then green.
3. PrecinctPage tests (City code, `w01p12`), then context and page and card plumbing.
4. Docs. Full gate, bundle size check, live drive.

## Risks

- Config shape: many callers read the default export. Keeping it shape-compatible avoids
  a wide rename; the cost is a County-flavored default export until #93 moves copy to the
  jurisdiction. Riskiest step: spreading must not change any value (election.test and
  the full suite guard it).
- The hardcoding scan now covers City URLs: any copy of the City board URL outside the
  config fails it, hence the referrals change.
- Bundle: about 2.9 KB of room. The adapter module and context are small; measured after
  the build.
- Not done here: wait times stay one shared `waitTimes` block with per-board `county` and
  `city` sources. Folding them into the jurisdiction blocks would rename about 40
  references across the wait page, its tests, e2e fixtures and the health check with no
  behavior gain; #91 can move them when City sites join the page.
- Not done: City data (#87), City lookup (#88), copy rewrite (#93), #57's broader survey.

## Proof

- Criteria 1, 6: `election.test.js`, `election-hardcoding.test.js`.
- Criteria 2, 8: the existing suite unchanged; PrecinctPage tests run through the context.
- Criteria 3, 4: `PrecinctPage.test.jsx` new cases (no County request for `W01P12`, City
  lookup link, `w01p12` redirect).
- Criterion 5: `ShareLink.test.jsx`, `jurisdictions.test.js`.
- Criterion 9: `src/test/build.test.js` budget after `npm run build`.
- Live drive: `npm run build && npm run preview`, open `/p/CC007` (renders results with
  fixtures or live data), `/p/W01P12` (not found, City lookup link, no County precinct
  query), `/p/w01p12` (redirects), `/p/XYZ` (not found).

## Revisions during implementation

- The City board's site and lookup URLs are in `src/config/referrals.js`, not the City
  block: `election.js` must load with no imports (the election window check copies it
  alone), the referral test keeps each referral URL in `referrals.js` only, and the City
  lookup page's URL starts with the board's. `src/data/jurisdictions.js` gives both
  adapters `officialLookupUrl` and `boardSiteUrl`. The plan's `referrals.js` change is
  an added `stlCityLookup` entry instead.
- The County adapter calls through to `arcgis.js` when called, so the cards' tests that
  replace part of `arcgis.js` keep working unchanged.
- The results cards read the adapter from a React context (`jurisdictionContext.js`)
  rather than props, so cards rendered alone default to the County.
- A well-formed City code that is not found keeps "Precinct W01P12" as its heading, as an
  unknown County code does; the title says not found.
- First-load JS grew 579 bytes gzipped (119,956 to 120,535 of 122,880).
