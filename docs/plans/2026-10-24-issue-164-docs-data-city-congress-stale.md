# Plan: docs/data.md: City districts section still says the County card reads the 2025 congressional field (issue #164)

Risk tier: Low. One stale sentence in a doc; no code, test or behavior changes.

Domain skills: frontend, testing, accessibility and data skills not applicable because no code,
UI, test or data access changes.

## Acceptance criteria

1. The St. Louis City "U.S. House First District" paragraph in `docs/data.md` no longer says
   the County card reads the 2025 field.
2. In its place, a pointer to the Precincts section's "Which congressional map (#150)"
   paragraph, which matches the code: the County card reads `congressional_district_20`
   (`congressionalField` in `src/config/election.js`).
3. Nothing else in `docs/data.md` changes.

## Files that change

- `docs/data.md`: replace the closing parenthetical of the City "First District" paragraph.

## Order of work

1. Replace "(The County card reads the 2025 field; #150 tracks that.)" with a sentence saying
   the County card reads the 2022 field, `congressional_district_20`, pointing to "Which
   congressional map (#150)" under Precincts.
2. Run the full gate.

## Risks

- Prettier reflow of the paragraph: run `npm run format:check`.
- Conflict with parked branches #143 and #160, which also touch `docs/data.md`: keep the edit
  to the one line.

## Proof

- `grep` shows the stale sentence is gone and `congressional_district_20` is what
  `src/config/election.js` reads.
- Full gate green (lint, format:check, test, build, test:e2e, test:perf). No live drive: no
  behavior changes, and the gate covers the docs-checking tests.
