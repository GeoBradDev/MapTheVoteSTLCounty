# Plan: Research and draft voter education topics from official sources (issue #22)

Risk tier: Medium. Content only (no code), but it is voter guidance where a wrong fact can
cost someone their vote, it spans 13 new files, and it changes existing behavior: `/learn`
stops showing the empty state and the polling places and early voting cards start linking to
the `voter-id` and `absentee` topics. Every topic needs owner review before merge (acceptance
criterion), so the PR is opened for review and never merged by this run. The owner's
instruction to draft the topics for review stands in for the Medium plan approval.

Domain skills: humanizer: invoke as a plain language pass on each topic (no em dashes, short
sentences). vercel-react-best-practices, frontend-design, chrome-devtools-mcp a11y-debugging:
not applicable because no React, CSS or page structure changes; the pages and their axe checks
come from #23. Django, FastAPI, Expo, payments, email: not applicable (frontend-only site, no
code change).

## Owner decisions (issue #22 comment, 2026-10-21, and the run brief)

- Official sources only: `.gov` hosts and the county board's own sites, exactly the allowlist
  in `src/features/learn/content/officialSources.js`. No vote.org or vote411.org.
- Every factual claim links to its official source; nothing from memory. Every source is
  fetched and read on 2026-10-21, which is each topic's `lastVerified`.
- A claim no official source confirms is left out of the topic and listed as an open item in
  a comment on #22 (the content model forbids `TODO` in topics). Discrepancies between
  sources, and stale county pages, go in the same comment. Where the county site and state
  law disagree, the topic follows the law (revisor.mo.gov) and the Secretary of State.
- No candidate or measure content of any kind. Plain language, about grade 6 to 8.
- Contacts: county board phone 314-615-1800 and Relay MO 711 only if an official page
  confirms them.

## Acceptance criteria

1. `content/en/learn/` holds 13 topics, one per issue topic, each a valid topic under the #21
   content model: `id` matching the file name, `title`, `group` (one of `before-you-vote`,
   `ways-to-vote`, `at-the-polls`, `get-help`), `election: 2026-11-03`,
   `lastVerified: 2026-10-21`, and numbered official `sources`. The topics on what ID to bring
   and on absentee voting use the ids `voter-id` and `absentee` (cardTopics.js).
2. Every factual sentence or list item carries a citation `[^id]` of a listed source, and every
   source and body link is on the official allowlist. No `TODO`, no vote.org or vote411.org.
3. No candidate, party-preference or ballot measure content.
4. Markdown stays inside the strict subset; headings hold only text and bold; no `###` before a
   `##`. `npm run build` passes, so the content checks pass.
5. Each topic's Flesch-Kincaid grade is measured (body text, citations removed) and reported in
   the PR; the target is about grade 6 to 8, and a topic over grade 9 is rewritten or the reason
   is given in the PR.
6. The full CI gate passes: lint, format check, tests, build, the Playwright accessibility run
   and the Lighthouse budgets (which cover `/learn`, now with topics).
7. A comment on #22 lists every claim left out for lack of an official source and every
   discrepancy found; #22 carries the `decision needed` label.
8. The PR says at the top that the owner must review and approve every topic before merge, and
   has a per-topic table (id, group, readability, sources). The run does not merge it.

## Topics (id, group)

| Issue topic | id | group |
| --- | --- | --- |
| Check your registration | `check-registration` | before-you-vote |
| Registration deadlines | `registration-deadlines` | before-you-vote |
| What ID to bring | `voter-id` | before-you-vote |
| If you moved or changed your name | `moved-or-changed-name` | before-you-vote |
| Absentee and no-excuse in-person absentee voting | `absentee` | ways-to-vote |
| Mail-in ballots | `mail-in-ballots` | ways-to-vote |
| Military and overseas voters | `military-overseas` | ways-to-vote |
| What to expect at the polls | `what-to-expect` | at-the-polls |
| Provisional ballots | `provisional-ballots` | at-the-polls |
| Accessible voting and curbside voting | `accessible-voting` | at-the-polls |
| Your rights at the polls | `your-rights` | at-the-polls |
| Voting with a disability, and getting help at the polls | `help-voting` | get-help |
| Who to contact | `who-to-contact` | get-help |

## Files that change

- `content/en/learn/<id>.md` for the 13 topics above (new). The `.gitkeep` there is removed.
- `docs/progress.md`: one line for #22.
- No code. If a test assumes `content/en/learn/` is empty and fails only because topics now
  exist, the test is not loosened; the failure is investigated and reported (tests that need
  fixtures already use them).

## Order of work

1. Fetch every source page on 2026-10-21 (Secretary of State pages, the Revised Statutes
   sections, the county board site, the county's ArcGIS lookup apps) and keep the text in the
   scratchpad as the record of what each page said.
2. Write the topics, one claim per sentence or list item, each cited.
3. Run the build and fix every content check failure.
4. Measure readability per topic and rewrite long sentences until each is near grade 6 to 8.
5. Run the full gate (lint, format check, tests, build, e2e accessibility, Lighthouse).
6. Review (Phase 5 finders), verify (Phase 7), PR, CI green, then the #22 comment and label.

## Risks

- A wrong date or rule. Mitigation: dates are stated as the rule from the statute or the
  Secretary of State and the 2026 date they give, and each is checked against a second
  official source where one exists (for example the county's Absentee Voting Lookup app hours
  against RSMo 115.277's second-Tuesday rule).
- Stale county pages (some still show 2020 hours and 2020-only mail-in voting). Mitigation:
  stale pages are never cited for a time-sensitive fact; the discrepancy goes in the #22
  comment.
- "Vote at any polling place." The county FAQ (#1, shown on the home page) says it; RSMo
  115.430 and the Secretary of State say a voter must vote at the correct polling place and a
  provisional ballot cast elsewhere is not counted. Following the owner's rule (law over county
  site), the topics do not repeat the vote-anywhere line; they tell voters to check their
  polling place and explain the wrong-place rule. The conflict goes in the #22 comment.
- Bot-blocked official pages (the Secretary of State's voter lookup portal answers 403 to
  scripts; the county site rate-limits). The daily link checker would report those as FAIL, so
  topics link to the Secretary of State page that links the lookup rather than the portal
  itself, and the #22 comment says so.
- Lighthouse on `/learn` with 13 topics: the topics are built-in data, so the page grows a
  little; the budget run checks it.

## Proof

- Criteria 1, 2 and 4: `npm run build` (the Vite plugin checks every topic) and `npm test`
  (the plugin and topic tests run against the real `content/` too where they read it).
- Criterion 2 and 3: a grep over `content/en/learn/` for `vote.org`, `vote411`, `TODO`,
  candidate and measure words; a reviewer reads every topic against its sources.
- Criterion 5: a Flesch-Kincaid script (text-readability, run from the scratchpad) on each
  topic body with citations and Markdown stripped; scores in the PR table.
- Criterion 6: the CI gate commands, locally and on the PR.
- Live drive: build, `npm run preview`, open `/learn`, two topic pages (one with a folded
  section), and a results page to see the `voter-id` and `absentee` card links.
