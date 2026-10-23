# Plan: Election Day rule: St. Louis County voters may vote at any County polling place (issue #152)

Risk tier: Medium. Copy, config and tests across several files, reversing existing behavior
(#72); no data, auth or money. Owner decision given in the issue (2026-10-22), which
approves rewriting the #72 tests to the new rule; the coordinator asked to ship fast, so
the plan goes ahead without a separate pause.

Domain skills: superpowers:test-driven-development invoke; frontend-design not applicable
because no visual design changes (copy only); vercel-react-best-practices not applicable
because no rendering or data flow changes; chrome-devtools a11y not applicable because the
markup structure is unchanged (fewer paragraphs, same links pattern).

## Acceptance criteria

1. No County page (home, County results polls card, /early-voting, learn topics) says a voter
   must vote at their assigned polling place, or that the nearest one may not be theirs.
2. The County rule says a registered St. Louis County voter may vote at any polling place in
   St. Louis County on Election Day, that this does not apply in the City of St. Louis, and
   cites the St. Louis County Board of Elections' own Polling Places page with a
   `lastVerified` date. It no longer cites RSMo 115.430 or the Secretary of State for the
   rule (both say "assigned").
3. The County board's phone number stays, with its source.
4. City pages (W..P.. codes) are unchanged: the City Board's quote, source and date; a test
   proves the City card shows none of the County rule text.
5. The /early-voting "ended" line says where a County voter may vote on Election Day. (Revised
   during review: a City clause pushed the first-load JavaScript over its 120 KB budget, which
   has 6 bytes to spare until #147 moves the learn topics out of the first load. City voters
   reach their own rule through the line's "Find your polling place" link.)
6. README, docs/data.md and the learn topics no longer state the #72 rule; docs/data.md
   records the owner decision replacing #72, with the County page's quote and read date.

## Source

`https://stlouiscountymo.gov/st-louis-county-government/board-of-elections/elections/polling-places/`,
read in a browser on 2026-10-22 (scripts get a Cloudflare 403): "Voters in Saint Louis County
may vote at any polling place in the County on Election Day." The April 7, 2026 FAQ PDF on
`extcontent.stlouisco.com` says the same.

## Files that change

- `src/config/election.js`: `electionDayPollingPlace.sources` becomes the County page,
  `lastVerified` 2026-10-22, comments and JSDoc.
- `src/config/election.test.js`: rewrite the #72 block to the new rule.
- `src/features/lookup/AssignedPollingPlace.jsx` and its copy and test renamed to
  `CountyElectionDayRule.jsx`, `countyElectionDayRuleCopy.js`,
  `CountyElectionDayRule.test.jsx`; drop the central polling place and Secretary of State
  lookup lines; add the City note.
- `src/i18n/en.json`: `assignedPollingPlace` becomes `countyElectionDayRule`; `nearestNote`;
  `waitTimes.season.ended`.
- `src/features/lookup/HomePage.jsx`, `PollsCard.jsx`, `nearbyPolls.js`,
  `CityElectionDayRule.jsx`, `src/config/cityResults.js`: imports and comments.
- Tests: `HomePage.test.jsx`, `PollsCard.test.jsx`, `PrecinctPage.city89.test.jsx`,
  `WaitTimesPage.test.jsx`.
- `content/en/learn/provisional-ballots.md`, `what-to-expect.md`, `moved-or-changed-name.md`:
  the County rule, citing the County page (`moved-or-changed-name.md` added in review: it told a
  voter who moved within the County to go to the polling place for the new address).
- `README.md`, `docs/data.md`.

## Order of work

1. Rewrite tests to the new rule (red).
2. Config, copy, component rename, i18n.
3. Learn topics, README, docs/data.md.
4. Full gate.

## Risks

- Learn topic Markdown is being moved by #147: keep the content edits small; rebase and
  resolve keeping both sides.
- The County page answers 403 to scripts: the content link check reports it as a skip.
- Saying the City rule wrongly: the City card keeps its quote unchanged; the "ended" line
  paraphrases only the City Board's own quoted rule.

## Proof

- `CountyElectionDayRule.test.jsx`: criteria 1 to 3.
- `election.test.js`: criterion 2 (sources, date), City quote untouched (4).
- `PrecinctPage.city89.test.jsx`: City card shows no County rule text (4).
- `PollsCard.test.jsx`, `HomePage.test.jsx`: criterion 1 on both pages.
- `WaitTimesPage.test.jsx`: criterion 5.
- Grep for "assigned polling place" in `src/`, `content/`, README: only City-board names.
- Live drive: home page, a County precinct page and /early-voting in the dev server.
