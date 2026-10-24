# Plan: Roadmap status update (issue #30)
Risk tier: Low. Docs only: the roadmap is the body of issue #30 and the repo change is docs/progress.md; no code, config or test changes.
Domain skills: humanizer: invoke (plain wording for the roadmap and log lines). frontend-design, vercel-react-best-practices, dataviz, test-driven-development: not applicable because no code or UI changes; TDD has nothing to test in a log file, the full gate still runs.

## Acceptance criteria
1. The old body of #30 is saved in the worktree before any edit.
2. Every issue listed in the roadmap shows its real state from `gh`: ticked when closed (with its merged PR, or "closed without code"), unticked when open, with the reason it is open.
3. The issues opened during the run are added (#139, #143, #144, #146, #154, #160, #164, #168, #176, #183, #186, #187) plus the extra done issues (#147, #150, #151, #152, #165, #172, #184, #191), with titles matching `gh`.
4. A "Status as of 2026-10-24" section lists what is open and why, including owner manual checks (#25 installs, #184 real-phone check, GA measurement ID steps).
5. #30 stays open (items remain); the PR says "Refs #30", not "Closes".
6. docs/progress.md gets the pending coordinator lines, reshaped to the file's format (a new batch heading, one line per issue, PR link, summary, follow-ups), keeping content, PR links and skills.
7. The two existing progress.md lines that name #25 for offline work (#18 and #38 entries) point at #183 instead.
8. No emojis and no em dashes in anything written.

## Files that change
- docs/progress.md
- docs/plans/2026-10-24-issue-30-roadmap-status.md (this plan)
- Issue #30 body (via `gh issue edit 30 --body-file`), not a repo file.

## Order of work
1. Commit this plan.
2. Edit docs/progress.md: the #25 to #183 fixes, then append a "Batch 5" section with the pending lines.
3. Write the new roadmap body in the worktree (`.claude/issue-30-body-new.md`, untracked), check for em dashes and emojis, apply with `gh issue edit`.
4. Run the gate, open the PR with "Refs #30", watch CI, merge.

## Risks
- Ticking an item whose real state differs from the coordinator notes: mitigated by reading every state with one GraphQL query (state, stateReason, closing PRs).
- Format drift in progress.md: match existing lines (`- #N: <PR url>: summary. Follow-up: ...`).
- Losing the old body: saved first.

## Proof
- `grep -c` for em dashes in both files returns 0.
- `gh issue view 30` after the edit shows the new body; diff against the saved old body.
- Full gate green (lint, format:check, test, build, e2e, perf) and CI green.
