# Plan: Learn topics, "come back to your polling place" for a provisional ballot without ID (issue #154)

Risk tier: Low. A copy change to four learn topic Markdown files plus one content test; no
code, no behavior a unit test cannot cover.

Domain skills: humanizer, not applicable because the edits are a few words in existing plain
language copy. vercel-react-best-practices, not applicable because no React code changes.
frontend-design and a11y skills, not applicable because no UI changes.

## Source check (2026-10-24)

- RSMo 115.427.4(1)(a): the ballot counts if "the voter returns to the polling place during
  the uniform polling hours ... or, if voting by absentee ballot in person, the voter returns
  to the election authority's office by 7:00 p.m. on election day".
- RSMo 115.427.3, the envelope certificate: "I return to this polling place today between
  6:00 a.m. and 7:00 p.m.", and 4(1)(b): eligible "to cast a ballot at the location where the
  ballot was cast".
- Missouri SOS Voter ID page: "you return to your polling place on Election Day with a photo ID".

The statute ties the return to the place where the provisional ballot was cast. Under the
County's any-polling-place rule (#152) and the City's (#94), "your polling place" can read as
a different place, so the topics say "the same polling place where you voted".

## Acceptance criteria

1. `provisional-ballots.md` ("When it counts") and `voter-id.md` ("If you do not have one of
   these IDs") say the voter returns to the same polling place where they voted the
   provisional ballot, by 7 p.m. on Election Day, cited to RSMo 115.427.
2. Neither topic says "come back to your polling place" any more.
3. `moved-or-changed-name.md` (name change) no longer implies one assigned polling place:
   "tell the election judges at the polling place where you vote".
4. `accessible-voting.md` checked; its "your polling place" means the place the voter planned
   to use and makes no claim about where a ballot must be cast, so it is left unchanged.
5. `lastVerified` stays 2026-10-21 on each topic: it means every source was re-read, and this
   change re-read only RSMo 115.427, the SOS Voter ID page and the SOS Other Voting Questions
   page (name change: "an election judge at your polling place"). (Revised during Phase 4:
   the first draft bumped it, which would have claimed a full re-read.)
6. The learn topics stay out of the first-load bundle (#147 landed); the build's budget check
   passes.
7. Full gate green.

## Files that change

- `content/en/learn/provisional-ballots.md`
- `content/en/learn/voter-id.md`
- `content/en/learn/moved-or-changed-name.md`
- `src/test/provisionalReturn.test.js` (new)

## Order of work

1. Write `src/test/provisionalReturn.test.js`: both topics name "the same polling place" in
   the block that cites rsmo-115-427 for the return, and neither says "come back to your
   polling place"; `moved-or-changed-name.md` does not say "judges at your polling place".
   Run it red, commit it alone.
2. Edit the three topics. Run it green.
3. Full gate.

## Risks

- Learn topic intros are in the first load; the changed text is in bodies only, which are
  lazy chunks since #147. Confirm with the build's bundle report.
- The SOS page says "your polling place"; the statute is the more specific source and is
  already cited.

## Proof

- Criteria 1 to 3: `src/test/provisionalReturn.test.js`.
- Criterion 5: the Vite plugin's `lastVerified` check plus a reviewed diff.
- Criterion 6: `npm run build` and `npm run test:perf` budget.
- Live drive: open `/learn/provisional-ballots` and `/learn/voter-id` in the built preview and
  read the new sentences.
