# Plan: Voter education topics for City voters, from the City Board's official pages (issue #94)

Risk tier: Medium. Content across all 13 learn topics plus one copy string, altering existing
text a voter acts on; the build checks structure, sources and hosts, but not that a fact is
true, so the owner's review of every changed topic is the real gate (the issue's acceptance
criterion). No code path, request or privacy behavior changes.

Domain skills: humanizer: invoke (all new copy). test-driven-development: invoke (a content
test that fails on today's uncited City sentences). frontend-design, vercel-react-best-practices,
a11y-debugging: not applicable because no layout, component or markup change; the topic pages
render the same Markdown blocks they already allow.

Plan approval: the coordinator for this run gave the shape (the issue's recommendation, one
topic with short "City of St. Louis" and "St. Louis County" sections where facts differ) and
holds the merge for the owner's per-topic approval, so the plan is committed without a
separate pause.

## Acceptance criteria

1. Every topic whose facts differ by board gives City voters the City Board's fact, from a
   City Board page on `www.stlouis-mo.gov/government/departments/board-election-commissioners/`
   read on 2026-10-23, cited next to the claim; County facts keep their County sources.
2. Where facts differ, a topic uses short "City of St. Louis" and "St. Louis County" `###`
   sections (or one sentence per board when a section is too much), not two topics.
3. Who to contact lists the City Board's phone, absentee phone, email, office address and
   hours, from its own pages.
4. Where to vote on Election Day follows each board's rule: County voters may vote at any
   polling place in St. Louis County (County Board's Polling Places page, #152); City voters
   may vote at any of the City's listed polling places (City Board's polling places page, the
   rule #89 quotes). RSMo 115.430 is not cited for the County rule.
5. No sentence about the City rests on a County source or on no source (#154's City-citation
   part): a test fails when a paragraph or list item that names the City cites nothing but
   County Board sources, and when a topic that names the City lists no City Board source.
6. `lastVerified` stays 2026-10-21: it means every source in the topic was re-read that day,
   and this run re-read only the City pages and the statutes behind changed sentences
   (115.165, 115.277, 115.287, 115.427, 115.637) on 2026-10-23, not every County and Secretary
   of State page. The City pages' read date goes in the PR and on the issue; the owner's
   review can move `lastVerified` once every source is re-read. (Revised during the run: the
   first draft set 2026-10-23.)
7. The `/learn` intro no longer says the guides are County-only.
8. The City Board's host is accepted as official (it is `.gov`; a test pins it), and the
   daily link check (#74) requests every new City link, as it reads every topic's sources
   and links.
9. Anything the City pages leave unconfirmed, or that conflicts with state law as written, is
   listed for the owner, not resolved silently.

## Files that change

- `content/en/learn/*.md`: all 13 topics (County wording to "your election board" where the
  sentence is about either board; City sections and sources added).
- `src/i18n/en.json`: `learn.intro`.
- `src/pageHead.test.js`: the learn intro it pins.
- `src/features/learn/content/topic.test.js`: the City Board's URL among accepted hosts.
- `src/test/cityContent.test.js` (new): criterion 5. After it went red, its City Board and
  County URLs were switched from literals to `referrals.stlCityBoard.url` and
  `election.countySiteUrl`, as the repo's no-hard-coded-URL tests require; no assertion
  changed.
- `src/test/citySections.test.js` (new, after finder 1): the same rule for blocks under a City
  heading and blocks that say "the City", which `cityContent.test.js` (frozen) misses.
- `src/features/learn/LearnPage.test.jsx`: the #93 test that pinned the County-only intro.
- `README.md`: Learn content's official hosts sentence names the City Board's site; a rule
  for City and County sections and the new test; the empty `/learn` state links both boards
  (true since #93).

## Order of work

1. Commit this plan.
2. Write `src/test/cityContent.test.js`; run it red against today's topics
   (`provisional-ballots.md` and `what-to-expect.md` name the City with no City source).
3. Edit topics one at a time, each from the City pages saved in the run's scratchpad.
4. Update `learn.intro` and its pinned test, the host test, and the README sentence.
5. Full gate; build and open the topic pages; run the content link check.

## Risks

- A City page and state law disagree: the City Board's No Excuse Absentee and Absentee
  Requirements pages say no provisional ballots are available at no-excuse sites, while
  RSMo 115.427.2(1) allows a provisional ballot when voting absentee in person without ID.
  The topics give City voters the City Board's statement and keep the statute's general
  rule; the owner decides.
- RSMo 115.287.2 (hospital teams) names "the county in which the jurisdiction is located";
  reading that as the City for City voters is an interpretation, flagged for the owner.
- The City Board's electioneering notice (50 feet) is dated October 6, 2026; the statute asks
  for notice six weeks ahead. The topic reports the City Board's notice as published.
- The City's "Vote in Person" page says voters use "their designated location or a Voting
  Center", while the polling places page says any of the listed locations. The topics follow
  the polling places page, as #89's config quote does.
- The City Board's Register to Vote page says it sends no confirmation for a new
  registration, while the Secretary of State says the election office sends a notice; the
  topic gives both, attributed (found by finder 1).
- The City pages list 314-622-3319 both as an absentee phone and as a fax number; the topics
  repeat it as the pages do.
- Topic bodies are separate chunks (#147), so longer topics do not touch the first-load budget.

## Proof

- Criterion 5: `src/test/cityContent.test.js`, red before the content change, green after.
- Criterion 8: `topic.test.js` accepts the City Board URL; `node scripts/check-content-links.mjs`
  passes the new City URLs.
- Criteria 1 to 4, 6, 7: the build's topic checks, and a live drive of `/learn`,
  `/learn/who-to-contact`, `/learn/what-to-expect` and `/learn/absentee` in the built site
  showing the City sections and their numbered sources; the owner's review.
