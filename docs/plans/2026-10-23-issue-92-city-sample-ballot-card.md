# Plan: City sample ballot card (issue #92)

Risk tier: Medium. A new, stateless City card (fully unit-testable) plus a new health
check, but it touches more than a few files and replaces the City's pending ballot card.
The coordinator's notes for this run set the design (citywide all-races PDF, wording,
config home, health check), so the plan proceeds on them.

Domain skills: vercel-react-best-practices: invoke (a React component, in the City chunk).
superpowers:test-driven-development: invoke. chrome-devtools-mcp:a11y-debugging: not
applicable as a separate pass because the e2e axe checks (e2e/a11y.e2e.js) and
Lighthouse already cover the City precinct page; the live drive reads the card's
accessible name. frontend-design: not applicable because the card reuses the County
card's button and text styles.

## Source

The owner supplied (2026-10-23) the City Board's sample ballot:
`https://www.stlouis-mo.gov/government/departments/board-election-commissioners/documents/upload/Nov26-All-Races-Sample-Ballot.pdf`.
HEAD: 200, `application/pdf`, 1,889,321 bytes, Last-Modified 2026-09-14. Its first page
reads "Sample Ballot / General Election / City of St. Louis / November 3, 2026 / All
Precincts". The City Board's Elections page
(`.../board-election-commissioners/elections/index.cfm`) lists "11/03/26 General Election"
with a "Sample Ballot" link to this PDF. The City publishes no per-precinct or per-ward
ballot, so the per-precinct match rule (#82) has nothing to match; the card never says
the PDF is the voter's own ballot. The Board's pages say nothing about which races a
voter sees, so the wording is neutral and minimal.

## Acceptance criteria

1. A City precinct page's "Sample ballot" card links the City Board's November 3, 2026
   all-races sample ballot PDF, from `cityResults.sampleBallot.url`, opening in a new tab
   with the same new-tab note as the County card.
2. The card says plainly it is the City's sample ballot with every contest in the City, and
   that the voter's own ballot has only the contests where they vote: the citywide and
   statewide ones and those for their ward and districts. It never says "your sample
   ballot" or names the precinct as the ballot's precinct. (Revised after review finder 1:
   the first wording, "only the races for your ward and districts", left out the citywide
   and statewide contests every City ballot carries.)
3. The card cites its source (the City Board's Elections page) and its last-verified date.
4. `cityResults.sampleBallot` holds `url`, `sources` and `lastVerified`; it is City-only
   config, so it reaches only the City chunk (build test marks it).
5. The card is in the City chunk (`src/cityChunk.js`), read with `cityComponent`; the first
   load does not grow beyond its budget.
6. A City precinct page never shows a County ballot or another precinct's ballot: the
   City branch never renders `SampleBallotCard` or reads the precinct's `html` field.
7. `scripts/check-config.mjs` has a `city sample ballot` check: HEAD the URL, pass on 200
   with `application/pdf`, fail otherwise, and its detail says the per-precinct match does
   not apply to a citywide ballot.
8. The pending card (and its `pending` / `pendingCity` copy) is removed, since every card
   for both jurisdictions is now built.
9. Docs (README, e2e Lighthouse comment) no longer say the City card waits on #92.

## Files that change

- `src/config/cityResults.js`: `sampleBallot: { url, sources, lastVerified }`.
- `src/features/lookup/CitySampleBallotCard.jsx` (new) and its test.
- `src/cityChunk.js`: export it.
- `src/features/lookup/ResultsCards.jsx`: City `ballot` body; remove `PendingCard`.
- `src/features/lookup/resultsCopy.js`, `src/i18n/en.json`: City ballot copy; drop pending copy.
- `src/features/lookup/PrecinctPage.city89.test.jsx`: the ballot card test now expects the PDF.
- `src/test/build.test.js`: the URL is a City chunk mark.
- `scripts/check-config.mjs` and `src/test/checkConfig.test.js`: the new check.
- `e2e/lighthouse.js`: the City page waits for the City ballot link too.
- `README.md`: the City ballot card, the health check paragraph, the new-election step.
- `docs/data.md`: the City sample ballot source.

## Order of work

1. Config entry. 2. Card test (red), card, chunk export, ResultsCards wiring, copy.
3. Page test update. 4. Health check test (red), check. 5. Build test mark, e2e. 6. Docs.

## Risks

- First-load budget (about 9 KB room): the card goes in the City chunk; only copy strings
  (en.json) reach the first load, a few hundred bytes.
- Overclaiming: copy must not imply the PDF is the voter's precinct ballot.
- The HEAD-count tests in checkConfig.test.js count every HEAD; the City HEAD must be
  excluded from the County sample counts without weakening them.

## Proof

- Criteria 1 to 3, 6: `CitySampleBallotCard.test.jsx` and `PrecinctPage.city89.test.jsx`.
- Criterion 4, 5: `build.test.js` mark check and the Lighthouse/first-load budget in CI.
- Criterion 7: `checkConfig.test.js` (pass, non-PDF, 404), plus a live run of
  `node scripts/check-config.mjs`.
- Criterion 8: grep shows no `pendingCity` left; ResultsCards tests.
- Live drive: build and preview, open `/p/W01P12` with the fixtures (e2e) and a live
  City precinct, and see the card's text and link.
