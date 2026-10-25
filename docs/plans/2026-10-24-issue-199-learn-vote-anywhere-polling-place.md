# Plan: Learn topics, "correct polling place" and "ask the county board for a different one" under the vote-anywhere rules (issue #199)

Risk tier: Medium (user approved the plan and wording, 2026-10-24). A copy change to two learn topic Markdown files plus one content test, but
it alters existing election-critical voter guidance (where a ballot counts, where a disabled
voter can go) days before Election Day, so it is raised one tier from Low for altering
existing behavior.

Domain skills: humanizer, not applicable because the edits are a few sentences of existing
plain language copy held to the official sources' words. vercel-react-best-practices, not
applicable because no React code changes. frontend-design and a11y skills, not applicable
because no UI changes.

## Source check (2026-10-24)

- RSMo 115.430 (revisor.mo.gov, read 2026-10-24): "The voter shall have the duty to appear
  and vote at the correct polling place." A voter eligible at another polling place "shall be
  directed to the correct polling place or a central polling place". A provisional ballot is
  counted only if it was cast "at a polling place established for the voter or the central
  polling place", and "Provisional ballots voted in the wrong polling place shall not be
  counted." The statute defines "correct" as a place established for the voter; it does not
  say there is only one.
- RSMo 115.436.3 (read 2026-10-24): "Upon request to the election authority, the election
  authority in any jurisdiction shall designate a polling place accessible to any physically
  disabled voter other than the polling place to which that voter would normally be assigned".
- City Board, polling places page (read 2026-10-24): "Any voter who is registered to vote at
  an address within the boundaries of St. Louis City can vote at any of the listed locations
  on November 3, 2026. Total 56 polling places", and "St. Louis County voters visit the St.
  Louis County Board of Elections."
- City Board, Accessible Voting page (read 2026-10-24): "If your local polling place is not
  accessible, you can visit any city-wide polling place". Already cited by the City section.
- County Board, Polling Places page: answers 403 (bot challenge) to scripts on 2026-10-24.
  Cited only as the existing pages cite it (footnote `county-polling-places`, read in a
  browser on 2026-10-22 per `src/config/election.js` and `docs/data.md`): "Voters in Saint
  Louis County may vote at any polling place in the County on Election Day." Nothing beyond
  that sentence is attributed to it. The owner's manual check is #201.
- Missouri SOS How to Vote and Other Voting Questions: Cloudflare blocks scripts on
  2026-10-24. Their citations stay only on sentences whose claim does not change.

So a voter can still be at a "wrong" polling place: each board's rule covers its own voters
(a County voter at a County polling place, a City voter at one of the City's 56), and 115.430
still decides what happens elsewhere. The topics now say which rule makes a place correct,
instead of "your correct polling place", which reads as one assigned place.

## Acceptance criteria

1. `provisional-ballots.md`, "At the wrong polling place": says the County rule above is for
   St. Louis County voters (citing `county-polling-places`) and the City rule for voters
   registered at a City address (citing `city-polling-places`); keeps "a provisional ballot
   cast at the wrong polling place is not counted" and "they tell you where to go" cited to
   RSMo 115.430; replaces "your correct polling place" with a polling place the voter's
   election board's rule above allows, or a central polling place, cited to RSMo 115.430.
2. `provisional-ballots.md` no longer says "your correct polling place".
3. `accessible-voting.md`, St. Louis County: opens with "A registered voter may vote at any
   polling place in St. Louis County on Election Day", cited to `county-polling-places` (the
   same words the provisional ballots topic attributes to that page); then says a voter with
   a physical disability can also ask the county board for a polling place that is
   accessible to them, cited to `sos-how-to-vote` and `rsmo-115-436`; keeps the central
   polling place sentence (now "Or you can vote at a central polling place") and the phone line with their citations.
4. `accessible-voting.md` no longer says "ask the county board for a different one", and its
   front matter lists `county-polling-places` with the same label and URL as
   `provisional-ballots.md`.
5. Nothing new is attributed to the County Board's Polling Places page beyond "a registered
   voter may vote at any polling place in St. Louis County on Election Day".
6. `lastVerified` stays 2026-10-21 on both topics (this run re-read only RSMo 115.430,
   115.436 and the two City pages; the SOS and County pages were not reachable).
7. Full gate green (lint, format check, tests including the City content tests, build,
   e2e, perf).

## Proposed wording

provisional-ballots.md, "### At the wrong polling place":

> The County rule above is for St. Louis County voters,[^county-polling-places] and the City
> rule is for voters registered at a City address.[^city-polling-places] Under Missouri law, a
> provisional ballot cast at the wrong polling place is not counted.[^rsmo-115-430] If the
> election judges find you are at the wrong place, they tell you where to go.[^rsmo-115-430]
> You can go to a polling place your election board's rule above allows, or a central polling
> place.[^rsmo-115-430][^sos-other-questions]

accessible-voting.md, "### St. Louis County":

> A registered voter may vote at any polling place in St. Louis County on Election
> Day.[^county-polling-places] If you have a physical disability, you can also ask the county
> board for a polling place that is accessible to you.[^sos-how-to-vote][^rsmo-115-436] Or
> you can vote at a central polling place.[^sos-how-to-vote] Call the county board at
> 314-615-1800 to ask.[^county-polls-app]

## Files that change

- `content/en/learn/provisional-ballots.md`
- `content/en/learn/accessible-voting.md`
- `src/test/voteAnywhereLearn.test.js` (new)
- `docs/data.md`, Phase 8 only if its sentence on the provisional ballots topic (section 2)
  becomes untrue.

## Order of work

1. Write `src/test/voteAnywhereLearn.test.js`: provisional-ballots does not say "your correct
   polling place", its wrong-place section cites both boards' polling places pages and RSMo
   115.430; accessible-voting does not say "for a different one", its County section cites
   `county-polling-places` for "any polling place in St. Louis County" and `rsmo-115-436` for
   asking for an accessible polling place. Run it red, commit it alone.
2. Edit the two topics. Run it green.
3. Full gate.

## Risks

- Overclaiming the County page: held by criterion 5 and the test, which checks the County
  sentence is the same one the provisional ballots topic already attributes to it.
- The City content tests (`cityContent.test.js`, `citySections.test.js`): the new
  provisional sentence naming the City cites the City Board page, so it passes.
- Topic bodies are lazy chunks (#147); the change is in bodies only.
- Chose not to: state that a City voter cannot vote at a County polling place (no source
  says it in those words); drop the 115.436 request line (it is still state law and a real
  option); bump `lastVerified` (would claim a full re-read).

## Proof

- Criteria 1 to 5: `src/test/voteAnywhereLearn.test.js` plus a reviewed diff.
- Criterion 6: the Vite plugin's `lastVerified` check plus the diff.
- Criterion 7: the gate commands.
- Live drive: open `/learn/provisional-ballots` and `/learn/accessible-voting` in the built
  preview and read the new sentences and their footnote numbers.

## Revision after review (Phase 5, finder 1)

Finder 1 found that two reworded sentences still cited Secretary of State pages that nobody
could re-read for the new wording (Cloudflare blocks scripts; no browser was connected): the
accessible-voting County sentence "ask the county board for a polling place that is
accessible to you" (`sos-how-to-vote`) and the provisional-ballots sentence "a polling place
your election board's rule above allows, or a central polling place"
(`sos-other-questions`). RSMo 115.436.3 and RSMo 115.430 each support their sentence alone.

The user approved (2026-10-24, option b): drop the SOS footnote from those two sentences
only, keep the wording, keep both source entries (other sentences still cite them), and
rewrite the frozen test to require only `[^rsmo-115-436]` on the accessible-voting sentence.

- `src/test/voteAnywhereLearn.test.js` (frozen) rewritten with that approval: the RSMo
  115.436 check now requires `accessible to you.[^rsmo-115-436]` with no further footnote.
- `src/test/wrongPollingPlaceCitation.test.js` (new, frozen once red): the provisional
  sentence cites `[^rsmo-115-430]` with no further footnote.
- Criterion 3 now reads: the accessible-place request is cited to `rsmo-115-436` alone.
  Criterion 1's last clause is cited to `rsmo-115-430` alone.

Proof the rewritten test still catches the defect, run in a scratch worktree at the merge
base `9e7c684` with only the rewritten test applied:

```
     × keeps the RSMo 115.436 request for an accessible polling place, cited to the statute alone
      Tests  7 failed | 1 passed (8)
```

On the issue branch before the citation fix, both new checks failed on their regex
(`Tests  2 failed | 7 passed (9)`).
