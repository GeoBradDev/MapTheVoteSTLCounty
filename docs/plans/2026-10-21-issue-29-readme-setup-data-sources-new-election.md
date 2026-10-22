# Plan: README: setup, data sources, updating for a new election, nonpartisan statement (issue #29)

Risk tier: Low. A docs-only change to `README.md`; no code, config or test changes, and
`render.yaml`'s `buildFilter` ignores `README.md`, so it does not even deploy.

Domain skills: humanizer, not applicable because the README already has a plain, factual
house style and the copy is reviewed by finders; every framework, UI, API, data, payments
and email skill, not applicable because no code changes.

## Acceptance criteria

1. The README opens with what the site is and who it is for (St. Louis County voters,
   with City voters referred to the City board), and a short table of contents.
2. A "Nonpartisan statement" section: reference tool only; no endorsements, candidate or
   measure commentary, or rankings; links only to official ballots and sources; neutral
   design (no red or blue, pointing to Colors). Its wording matches the statement proposed
   in PR #115 (issue #71) and says the in-app wording is settled in #71.
3. A "Privacy statement" summary near the top that agrees with the detailed Privacy
   section and `src/features/privacy/privacyCopy.js` (no address storage, no analytics,
   no cookies, no server of our own, share links hold only the precinct code), linking
   to the detailed section and `/privacy`.
4. Local setup and scripts: the existing Development section, plus the data scripts
   (`inspect-data`, `record-fixtures`, `check-config`, `check-geocoder`,
   `check-content-links`, `smoke`) listed with one line each.
5. A "Data sources" section summarizing `docs/data.md` with links: the county's ArcGIS
   layers (precincts, polls, county boundary) and portal, the sample ballot PDFs, the
   county and City address services, Photon, the OpenFreeMap basemap and the official
   sources for the voter education content.
6. An "Updating for a new election" section, step by step: run `inspect-data.mjs`
   (editing its service list), find the new `precincts_YYYY_MM_view` and
   `polls_YYYY_MM_view`, update `src/config/election.js` (every election-specific value),
   update `docs/data.md`, re-record fixtures (before the checks that read them), re-verify every content topic and
   bump `election` and `lastVerified`, run the health check (`check-config.mjs`, plus the
   geocoder and link checks), run the gate, deploy and smoke test, and do the hand checks.
7. "Deploying" stays as the existing Deploy section (renamed in the contents only if
   needed).
8. A "Contributing" section, including the rule that voter information needs an official
   source, the nonpartisan rules, the CI gate, that config changes go in
   `election.js`, and the existing Privacy rule that a change to what is sent changes the
   privacy notice. No new project rules.
9. A "Disclaimer": not an official county app; for official information, contact the
   St. Louis County Board of Elections (its page and 314-615-1800), and City voters the
   City board.
10. A "License" section that states the current fact: no license file has been chosen
    yet. A new issue asks the owner to choose one.
11. Every statement in the new sections is true of the current code and docs; no existing
    section's rules change.

## Files that change

- `README.md` only.

## Order of work

1. New intro, table of contents, Nonpartisan statement, Privacy statement and Disclaimer at
   the top.
2. Extend Development with the data scripts.
3. Add Data sources and Updating for a new election after Election config / Learn content /
   Data health check context (placed after Development, before Deploy, so the election
   steps can link the later detailed sections).
4. Contributing and License at the end.
5. Open the license issue.

## Risks

- Wording drift from #71: if the owner changes the #71 statement, this README must follow.
  Mitigation: the section says #71 owns the in-app wording; the PR notes the dependency.
- Stale facts (counts, hosts, script names): mitigated by citing files, not figures, and by
  the finder pass.
- City parity steps for a new election belong to #95 (open); not added here beyond the
  City address service and referral that already exist.

## Proof

Docs only, so no unit test can cover the criteria. Proof is: the full gate (lint, format
check, tests, build, e2e, perf) green, a Compliance finder checking each criterion against
the README and the code it describes, and the Phase 7 verifier reading the README against
the repo. Live drive: skipped, since the change cannot affect the running app
(`README.md` is in `buildFilter.ignoredPaths` and is not imported).
