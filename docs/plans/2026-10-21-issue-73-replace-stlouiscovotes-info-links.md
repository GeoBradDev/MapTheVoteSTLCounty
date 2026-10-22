# Plan: Replace stlouiscovotes.info links (issue #73)

Risk tier: Medium. Config, copy, content sources and the official-host allowlist change across
many files and alter existing behavior (where five screens link), but every change is a value
a unit test can check; nothing stateful or async changes.

Domain skills: no `## Domain skills` profile table exists. vercel-react-best-practices: not
applicable because no component logic or rendering changes, only config values and copy maps.
No payments, email, API or data skill applies.

## Acceptance criteria

1. No `stlouiscovotes.info` URL is left in `src/`, `content/` or `render.yaml`. A test
   enforces it. The same test also rejects `stlouiscountymovotes.gov`, which reaches the new
   page only after two hops and a meta refresh.
2. `election.countySiteUrl` is
   `https://stlouiscountymo.gov/st-louis-county-government/board-of-elections/`, so every
   "St. Louis County Board of Elections" link in the app opens the new county page in one
   hop. The page answers 403 to scripts (a Cloudflare bot challenge), so the one-hop claim is
   checked by hand in a browser by the owner; automation here can only confirm the href.
3. Source links show "St. Louis County Board of Elections", not a bare host:
   `resultsCopy.js` `sourceNames` maps `stlouiscountymo.gov`; `stlouiscovotes.info` is removed
   once nothing cites it.
4. `electionDayHours.sources` no longer cites the retired FAQ; RSMo 115.407 alone supports the
   hours and the in-line rule. `lastVerified` moves to 2026-10-21 because the statute was
   re-read today (it says 6 a.m. to 7 p.m. and that voters in line at 7 p.m. may vote).
5. `electionDayPollingPlace.phoneSource` no longer cites the retired Contact Us page. It cites
   the county's November 3, 2026 Polling Place Lookup app, whose live config (re-read
   2026-10-21) says "call 314.615.1800"; the source link is named
   "St. Louis County Board of Elections Polling Place Lookup".
6. `OFFICIAL_DOMAINS` no longer allows `stlouiscovotes.info`; a test asserts
   `https://stlouiscovotes.info/faq/` is not official. `topic.test.js` examples use a live
   official host.
7. Learn topics stop citing `stlouiscovotes.info/about-us/` and `/registration/`. Each claim
   those sources supported is re-sourced to the county's 2026 ArcGIS apps (phone, email,
   Relay, office address, absentee-period hours), as the issue's fallback says. Claims no
   readable source supports are narrowed to what the source says (see Risks).
8. `docs/data.md` describes the current county site: the redirect chain, the 403 behavior,
   and the retired `.info` sources marked as retired with the date.
9. `npm run lint`, `npm run format:check`, `npm test`, `npm run build`, `npm run test:e2e`
   and `npm run test:perf` pass.

## Files that change

- `src/config/election.js`: `countySiteUrl` and its comment; `electionDayHours.sources` and
  `lastVerified`; `electionDayPollingPlace.phoneSource` and its comment.
- `src/features/lookup/resultsCopy.js`: `sourceNames`.
- `src/features/lookup/assignedPollingPlaceCopy.js`: `sourceNames` for the phone source.
- `src/features/learn/content/officialSources.js`: drop `OFFICIAL_DOMAINS`.
- `src/features/learn/content/topic.test.js`: examples, plus the not-official test.
- `src/test/retired-sites.test.js` (new): no retired county URL under `src/`, `content/`,
  `render.yaml` or `index.html`.
- `content/en/learn/{check-registration,moved-or-changed-name,who-to-contact,absentee,accessible-voting,your-rights,help-voting,what-to-expect}.md`:
  sources.
- `docs/data.md`: "Official website domain", the polling place join paragraph, the absentee
  section note.
- `README.md`: the learn content section's description of the official hosts (added after
  the first review).
- `src/config/election.test.js`: only if an assertion names the old host (it does in a
  negative check, which stays valid).

## Order of work

1. Red: the retired-sites test and the `isOfficialUrl` not-official test. Commit them red.
2. Config, copy maps, allowlist, `topic.test.js` examples.
3. Content sources.
4. Docs.
5. Full gate.

## Risks

- Removing the domain from the allowlist fails the build for any topic still citing it: the
   point of the change, and the build names each file.
- `who-to-contact` said "Office hours: Monday to Friday, 8 a.m. to 4:30 p.m." from the retired
  Contact Us page. The only readable current source, the Absentee Voting Lookup app, gives the
  Board office's weekday hours as 8 a.m. to 4:30 p.m. through Friday, October 30. The line is
  narrowed to that.
- The topic's "Website" line moves from `stlouiscountymovotes.gov` to the new page. The daily
  content link check (`scripts/check-content-links.mjs`) will likely see the page's 403 bot
  challenge and fail until #74 teaches it to skip bot challenges. Accepted: #74 already
  covers it, and the alternative keeps a two-hop link.
- The new county page could not be read from a script, so no claim relies on its text; it is
  cited only as the board's website.
- Not done: adding `extcontent.stlouisco.com` to the allowlist (issue recommends not now).

## Proof

- Criterion 1: `src/test/retired-sites.test.js`, red before the change, green after.
- Criterion 2: existing HomePage, PrecinctPage, PrecinctMap, EarlyVotingCard and LearnPage
  tests read `election.countySiteUrl`, so they assert the new href with no change;
  `election-hardcoding.test.js` keeps the URL out of the rest of `src/`.
- Criteria 3 and 5: `AssignedPollingPlace.test.jsx` (distinct, non-empty names per source) and
  a `resultsCopy` lookup check in the precinct page tests.
- Criterion 6: `topic.test.js`.
- Criterion 7: the build's content validation (`npm test` and `npm run build`).
- Live drive: run the production build, open `/`, `/learn`, `/learn/who-to-contact` and a
  precinct page, and confirm every Board of Elections link's href is the new page and no
  rendered link points at a retired host.

## Revisions

- Frozen test rewritten (`topic.test.js`, one `isOfficialUrl` accept example). The red commit
  used `.../board-of-elections/faq/` as the example, which contains `countySiteUrl`, so
  `election-hardcoding.test.js` failed on the test file itself. The example became
  `https://stlouiscountymo.gov/st-louis-county-government/`, which still covers the new host
  and holds no config URL. No assertion was weakened. This was decided inside the run, without
  a separate owner approval, because the run's instructions leave such low-stakes calls to
  the agent; the PR body records it. Proof the rewritten test still catches the defect, run
  at the merge-base with only the rewritten test applied: `rejects
https://stlouiscovotes.info/faq/` and `rejects https://www.stlouiscovotes.info/about-us/`
  fail (2 failed, 52 passed).
- `retired-sites.test.js` skips `*.test.js(x)` files, since `topic.test.js` must name a
  retired URL to prove it is rejected (issue step 5).
- Review 1: `check-registration.md`'s phone line said a call checks registration, which the
  polling place app does not say; narrowed to "Questions? Call ...". README's official hosts
  sentence updated.
