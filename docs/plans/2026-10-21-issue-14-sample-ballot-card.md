# Plan: Sample ballot card (issue #14)

Risk tier: Medium. A small, unit-testable card that renders one parsed link, but it replaces
the pending placeholder in an existing screen (altering behavior) and what its link does
in a browser (a new tab, or a download of the county's PDF) is only fully shown by a live
drive. Nothing touches auth, money, data
writes or outward messages, so nothing forces High. The run is unattended (dispatched by the
owner's orchestrator, which asks for sensible calls on low-stakes choices), so the plan is
committed without an interactive approval; the PR says so.

Domain skills:
- superpowers:test-driven-development: invoke.
- chrome-devtools-mcp (chrome-devtools): invoke for the live drive.
- vercel-react-best-practices: not applicable because the card is a pure render of one
  prop, with no effects, fetching or memoization.
- frontend-design: not applicable because the card uses the existing token classes and
  card layout from #11.
- context7: not applicable because only React and Testing Library APIs already in use are
  needed.
- expo, django, django-ninja, fastapi, claude-api, dataviz: not applicable because none of
  those stacks are involved.

## Acceptance criteria

1. The "Sample ballot" card reads the precinct's `html` field only through
   `parseSampleBallot` (#6). The raw field is never rendered; `no-inner-html.test.js` stays
   green.
2. When the parser returns `{ url, fileName }`, the card shows a button-styled link with the
   text "Open your sample ballot (PDF)" and the file name (for example `CC-007.pdf`) as
   secondary text. With no file name, the secondary line is left out.
3. The link has `href` equal to the parsed URL, `target="_blank"` and
   `rel="noopener noreferrer"` (noreferrer matches every other external link in the app).
   Its accessible name tells screen reader users it opens a PDF in a new tab, or downloads
   it: the county serves each PDF with `Content-Disposition: attachment`, so most browsers
   save it instead of showing it (found by the Phase 7 verifier; revised then).
4. One line of neutral copy above the link: "The sample ballot shows the contests and
   measures on your ballot." Nothing about candidates or parties.
5. Nonresidential and Not In Election precincts show no card (already done by
   `precinctStatus().showBallot` from #11; tests keep covering it).
6. When the field has no link, the link fails validation, or the field cannot be read
   (anything but `{ url }` from the parser), the card says it could not find the link and
   links the county's official lookup (`election.officialLookupUrl`) instead.
7. Opens the right PDF for CC007, MER013 and FLO030: tests render the card from live
   responses recorded for those three precincts and check each link's URL and file name.
   Each URL was checked on 2026-10-21 to serve `application/pdf` with that file name.
8. All new text lives in `src/features/lookup/resultsCopy.js`. No new external origin is
   fetched (opening a link is navigation, not governed by `connect-src`), so `render.yaml`
   does not change.

## Files that change

- `src/features/lookup/SampleBallotCard.jsx` (new): the card body. Takes `html`, calls
  `parseSampleBallot`, renders the link or the fallback.
- `src/features/lookup/SampleBallotCard.test.jsx` (new).
- `src/features/lookup/ResultsCards.jsx`: render `SampleBallotCard` in the ballot slot;
  take a `ballotHtml` prop.
- `src/features/lookup/PrecinctPage.jsx`: pass `precinct.html` down.
- `src/features/lookup/PrecinctPage.test.jsx`: the card shows the CC007 link; add the
  ballot card to the built cards in the "links each card to the official lookup until the
  card is built" test.
- `src/features/lookup/resultsCopy.js`: the card's text; the pending comment no longer
  names #14.
- `scripts/record-fixtures.mjs`: record `precinct-by-id-mer013.json` and
  `precinct-by-id-flo030.json`.
- `docs/raw/fixtures/precinct-by-id-mer013.json`, `precinct-by-id-flo030.json` (new).

## Order of work

1. Record the two fixtures.
2. `SampleBallotCard` with its tests (TDD): three precincts, no file name, missing link,
   invalid link, unreadable field.
3. Wire it into `ResultsCards` and `PrecinctPage`, update the page tests.
4. Docs, gate, live drive.

## Risks

- A wrong link is worse than no link: the card shows a link only when the parser returns a
  URL that passed `sampleBallotUrlPattern`; every other result falls back.
- `target="_blank"` without `noopener` would hand the PDF tab `window.opener`; the test
  checks `rel`.
- The hardcoding test fails if a test writes a config value; the new tests read URLs from
  the fixtures instead of writing them.
- Riskiest step: the PrecinctPage test change, since it was written for the pending card.

## Proof

- Criteria 2, 3, 4, 6, 7: `SampleBallotCard.test.jsx`.
- Criteria 1, 5 and wiring: `PrecinctPage.test.jsx`, `no-inner-html.test.js`.
- Criterion 8: `render.test.js` and `election-hardcoding.test.js` stay green unchanged.
- Live drive: `/p/CC007`, `/p/MER013` and `/p/FLO030` show the card with the right link;
  `curl -I` on each URL shows `application/pdf` with that file name; clicking the link
  starts the download (the county sends it as an attachment); `/p/AP200` shows no card.
