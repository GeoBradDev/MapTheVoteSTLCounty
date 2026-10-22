# Plan: Sample ballot link is not checked against the precinct it is shown for (issue #82)

Risk tier: Medium. It alters existing voter-facing behavior (which links the sample ballot
card shows) and the data health check, but every path is a pure function or a small
component that unit tests fully exercise. Two source files, two test files, one script.

Domain skills:
- superpowers:test-driven-development: invoke.
- vercel-react-best-practices: not applicable because the change only passes one more
  string prop into an existing component.
- frontend-design, chrome-devtools-mcp: not applicable because no layout or styling
  changes; the card's existing fallback is reused.
- context7, expo, django, django-ninja, fastapi, claude-api, dataviz: not applicable
  because none of those stacks or libraries are involved.

Mode: commit, under the repo CLAUDE.md git exception. The run is unattended: the
coordinator asked for sensible calls on low-stakes choices, so the plan is committed without
a separate owner approval pause, and the choices are listed in the PR body.

City side: the owner's comment asks for the same rule on City sample ballot links. The City
has no sample ballot card yet; that is tracked in #92, whose tasks already require it. Out
of scope here.

## Acceptance criteria
1. A precinct page never shows a sample ballot link whose file name names another precinct.
2. The health check fails, naming the precincts, when any link's file name does not match.
3. A link whose file name matches the precinct (ignoring case, the hyphen and `.pdf`, as in
   `CC007` and `CC-007.pdf`) still shows, as today.
4. A link with no file name now shows the official lookup fallback instead of the link
   (decision asked for in the issue: the card cannot confirm such a link belongs to this
   precinct; the health check already fails on it).

## Files that change
- `src/data/sampleBallot.js`: new export `fileNameMatchesPrecinct(fileName, code)`.
- `src/data/sampleBallot.test.js`: tests for it.
- `src/features/lookup/SampleBallotCard.jsx`: takes `code`; shows the link only when the
  file name matches it, else the existing fallback.
- `src/features/lookup/ResultsCards.jsx`: passes `code` to the card.
- `src/features/lookup/SampleBallotCard.test.jsx`: matching shows; another precinct's file
  shows the fallback; no file name shows the fallback (replaces the old "leaves out the file
  name line" test, whose behavior this issue changes).
- `scripts/check-config.mjs`: "sample ballot links" reports `<code>: link names <file>, not
  this precinct`.
- `src/test/checkConfig.test.js`: the healthy world's file names use the real form
  (`AB-001.pdf`, zero padded, as live data does); a new mismatch case; the shared-link case
  now also counts the precinct holding another precinct's file.
- `README.md` (data health check) and `docs/data.md` (file name pattern, health check):
  say the file name now decides whether the link shows, and that the check fails on a
  mismatch. Added after review finder 1.

## Order of work
1. Red tests for the matcher, the card and the health check. Commit them alone, freeze in
   `.claude/fix-lock`.
2. Implement the matcher, the card prop, ResultsCards, the health check. Green.
3. Full gate.

## Risks
- A correct link rejected: live data on 2026-10-21 has 0 mismatches over 974 links with
  this comparison, so no voter loses a correct link. The match is exact after normalizing,
  so `CC-0070.pdf` does not match `CC007`.
- `precinctStatus.js` reads `parseSampleBallot(...).message` only; unchanged.

## Proof
- Criterion 1 and 4: `SampleBallotCard.test.jsx` mismatched and empty file name cases.
- Criterion 2: `checkConfig.test.js` mismatch case names the precinct.
- Criterion 3: `SampleBallotCard.test.jsx` fixture cases with each fixture's own code;
  `sampleBallot.test.js` matcher cases.
- Live drive: build and preview, open `/p/CC007` and confirm the sample ballot link still
  shows `CC-007.pdf`.
