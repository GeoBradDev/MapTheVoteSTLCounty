# Plan: Parse and validate sample ballot links from the precinct html field (issue #6)

Risk tier: High. The function decides which URL from a third-party field the app will link
voters to, and keeps markup in that field from ever being rendered, so it is a security
control (forced High). Otherwise it would be Low: one pure function, fully unit testable,
new code only.

Domain skills:
- superpowers:test-driven-development: invoke.
- vercel-react-best-practices, frontend-design: not applicable because no React or UI code
  changes; the sample ballot card that renders the result is #14.
- context7 (docs lookup): not applicable because only plain JavaScript regex and string APIs
  are used.
- expo, django, django-ninja, fastapi, claude-api, dataviz: not applicable because none of
  those stacks are involved.

Mode: commit. The owner authorized commits, pushing this issue branch, the PR and its squash
merge for this run. Plan approval was delegated by the same instruction (no interactive
owner gate for this run).

Scope decisions:
- The parser lives in `src/data/sampleBallot.js`, next to the client that returns `html`
  (`src/data/arcgis.js` normalizes an empty `html` to `null`).
- Rendering the card is #14. This change adds the parser and a test that fails if any file
  under `src/` uses `dangerouslySetInnerHTML`, so the "never render html" rule is enforced
  for #14 and later work, not only promised.
- A link whose URL fails `election.sampleBallotUrlPattern` yields `{ message: null }`: there
  is nothing safe to show, and the raw text contains markup. The UI (#14) then shows its own
  fallback, such as the official lookup link.
- The acceptance check is `scripts/check-sample-ballots.mjs`, which queries the live layer
  through the election config and parses every row. It is committed so it can be rerun next
  election; #28 (data health check) may absorb it.

## Acceptance criteria

1. `src/data/sampleBallot.js` exports `parseSampleBallot(html)`, which returns either
   `{ url, fileName }` or `{ message }`, never both shapes and never throws for any input.
2. The href is pulled with a regex that accepts unquoted, single-quoted and double-quoted
   values (case-insensitive `href`, optional whitespace around `=`). The URL is returned
   only when it matches `election.sampleBallotUrlPattern` in full; no URL pattern is
   written in `src/data/`.
3. `fileName` is the link text with tags removed and whitespace trimmed, or `null` when
   empty. It is for display only.
4. A link whose URL is rejected (a non-portal URL, a `javascript:` URL, an `http:` URL, a
   URL with extra path or query) returns `{ message: null }`.
5. Text with no link returns `{ message }` holding the plain text: tags removed, whitespace
   collapsed and trimmed. The nonresidential message comes back verbatim.
6. `null`, `undefined`, a non-string, an empty or whitespace-only string returns
   `{ message: null }`.
7. No file under `src/` uses `dangerouslySetInnerHTML`; a test fails if one does.
8. All 974 `In Election` precincts on the live layer parse to a URL that matches the
   pattern, and every `Nonresidential Precinct` row parses to a message. The
   `scripts/check-sample-ballots.mjs` output is noted in the PR.

## Files that change

- `src/data/sampleBallot.js` (new): `parseSampleBallot`.
- `src/data/sampleBallot.test.js` (new): unit tests, including the recorded CC007 and AP200
  fixtures.
- `src/test/no-inner-html.test.js` (new): scans `src/` for `dangerouslySetInnerHTML`.
- `scripts/check-sample-ballots.mjs` (new): live acceptance check.
- `docs/data.md`: point the parsing plan at the parser and the check script.

## Order of work

1. Tests for `parseSampleBallot` (red), then the parser (green).
2. The `dangerouslySetInnerHTML` scan test (green from the start, plus a self-check that the
   scanner finds the string in a temp file).
3. The live check script, run against the live layer.
4. Docs.

## Risks

- An overly loose href regex could accept a URL with trailing characters. Mitigated by
  matching the whole URL against the anchored config pattern.
- The first href wins when there are several. The live data has one per row; the check
  script confirms it.
- HTML entities in the plain message (`&amp;`) are not decoded. The live messages contain
  none; the check script prints any message containing `&` so a future change is visible.

## Proof

- Criteria 1 to 6: `src/data/sampleBallot.test.js` (CC007 fixture, unquoted, single and
  double quotes, the nonresidential fixture, empty and null, a non-portal URL, a
  `javascript:` URL, and the other rejected forms).
- Criterion 7: `src/test/no-inner-html.test.js`.
- Criterion 8: `node scripts/check-sample-ballots.mjs` output in the PR.
- Live drive: no UI consumes the parser yet (#14), so the live check script against the
  real layer is the drive.
