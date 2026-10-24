# Plan: Roadmap status and progress log batch 6 (issue #30)
Risk tier: Low. Docs only: the roadmap is the body of issue #30 and the repo change is docs/progress.md; no code, config or test changes.
Domain skills: humanizer: invoke (plain wording for the roadmap). frontend-design, vercel-react-best-practices, dataviz, test-driven-development: not applicable because no code or UI changes; the full gate still runs.

## Acceptance criteria
1. The old body of #30 is saved before any edit.
2. Every issue touched in this run (#27, #120, #125, #137, #139, #143, #144, #146, #154, #160, #164, #168, #176, #183, #186, #187, #209) shows its real state from `gh`: ticked when closed (with its merged PR, or "closed without code"), unticked when open, with the reason.
3. Issues opened this run are listed with titles matching `gh`: #198, #199, #201, #202, #203, #209, #212, #214 (and the automated #204).
4. A refreshed "Status as of 2026-10-24" section lists owner-pending items (#176 and #146 needs-decision with the recommendation; #27 and #201 owner checks; #125 and #96 Search Console and Bing steps) and the items held until after November 3 (#120 with PR #194, #183, #214 typed out-of-state addresses).
5. #30 stays open; the PR says "Refs #30".
6. docs/progress.md gets a "## Batch 6 (2026-10-24)" section after Batch 5 with the coordinator's lines copied as-is, plus a final #30 line for this PR.
7. The Batch 1 #15 line gets "(2022 map since #150)" appended, the rest of the line unchanged.
8. No emojis and no em dashes in anything written.

## Files that change
- docs/progress.md
- docs/plans/2026-10-24-issue-30-roadmap-batch-6.md (this plan)
- Issue #30 body (via `gh issue edit 30 --body-file`), not a repo file.

## Order of work
1. Commit this plan.
2. Edit docs/progress.md: the #15 note, then append Batch 6.
3. Write the new roadmap body, check for em dashes and emojis, apply with `gh issue edit`.
4. Run the gate, open the PR with "Refs #30", watch CI, merge.

## Risks
- Ticking an item whose real state differs from the coordinator notes: mitigated by reading every state with GraphQL (state, stateReason, closing PRs).
- Altering a coordinator line while copying: mitigated by diffing the new section against the source file.

## Proof
- `grep -c` for em dashes in both texts returns 0.
- `diff` of the Batch 6 lines against the coordinator file shows only the added #30 line.
- `gh issue view 30` after the edit matches the written body.
- Full gate green (lint, format:check, test, build, e2e, perf) and CI green.
