# Plan: Follow RSMo 115.430 in app copy: Election Day voters must use their assigned polling place (issue #72)

Risk tier: Medium. A copy and config change fully covered by unit tests, but it reverses
existing election-critical behavior (the "vote at any polling place" line) across several
files. The owner's decision (2026-10-21) and the run brief stand in for the Medium plan
approval; nothing here goes beyond that decision.

Domain skills:
- vercel-react-best-practices: not applicable because the change swaps text and adds one
  small presentational component, with no data fetching, rendering or bundle change.
- frontend-design: not applicable because the layout and styling stay as they are.
- chrome-devtools-mcp:a11y-debugging: not applicable as a skill; the existing axe checks
  (`npm run test:e2e`, `a11yPages.test.jsx`) cover the changed pages.
- No API, data, payments or email skill applies.

## Findings

- RSMo 115.430 (read 2026-10-21): "The voter shall have the duty to appear and vote at the
  correct polling place" and "Provisional ballots voted in the wrong polling place shall not
  be counted." A voter at the wrong place is sent to the correct or a central polling place.
- Missouri Secretary of State, On Election Day (read 2026-10-21): "You can only vote at your
  assigned polling place or, if there is a problem at your assigned polling place, you may be
  eligible to vote at the central polling place. Verifying your assigned polling place with
  your local election authority prior to Election Day will help to eliminate potential
  complications." It says voters "may be able to find" their polling place with the state's
  lookup.
- Official county data assigns no polling place to a precinct. Checked live on 2026-10-21:
  `polls_2026_11_view` has no precinct field and `precincts_2026_11_view` no polling place
  field; neither do `11_3_2026_Precincts`, `11_3_26_PollingPlaces` or the November 3, 2026
  dashboard views. The county's own Polling Place Lookup only finds the closest Election
  Day polling places. So the app cannot show an assigned place; it says plainly how to
  confirm it.
- The county's Contact Us page lists (314) 615-1800. PR #68's topics already say "The
  county board can tell you your polling place ... Call 314-615-1800", cite RSMo 115.430
  for "A provisional ballot cast at the wrong polling place is not counted", and cite the
  Secretary of State's On Election Day page. This copy follows the same wording and sources.
- In-person absentee (early voting) sites are a separate thing, already shown in the Early
  voting card with the county's own source. The polls card points there rather than making
  a new eligibility claim.
- City side (#85, #89): the City Board says City voters may vote at any listed location. The
  City has no results page yet (#89), so this change words the rule for St. Louis County
  only and keeps it in one component that #89 can give a City variant with its own source.

## Acceptance criteria

1. No app copy, config, test or current doc says or implies that a St. Louis County voter may
   vote at any polling place on Election Day. (Historical plans under `docs/plans/` stay as
   records.)
2. The home page and the polling places card both say that on Election Day the voter must
   vote at their assigned polling place, and that a provisional ballot cast at a different
   polling place is not counted, citing RSMo 115.430 and the Missouri Secretary of State.
3. Both say how to confirm the assigned polling place: call the St. Louis County Board of
   Elections at 314-615-1800 (a `tel:` link), or possibly the Secretary of State's Voter
   Outreach Center, worded with the Secretary of State's own hedge ("may be able").
4. The polling places card says the listed places are the nearest Election Day polling
   places and the nearest may not be the voter's assigned one, and points to the Early
   voting card for voting in person before Election Day.
5. The rule lives in `src/config/election.js` with its sources and verification date
   (replacing `voteAnywhere`), the phone number with it and the county page that lists it
   (`phoneSource`, cited next to the rule's sources), and no election-specific value is
   written elsewhere in `src/`.
6. Nonpartisan wording; links only to official hosts (`revisor.mo.gov`, `sos.mo.gov`,
   `voteroutreach.sos.mo.gov`, and the county board's `stlouiscovotes.info` for the phone number); lint, format, tests, build, e2e and perf all pass.

## Files that change

- `src/config/election.js`: replace `voteAnywhere` with
  `electionDayPollingPlace: { sources, lastVerified, phone }` (sources: RSMo 115.430, SOS On
  Election Day page) and its JSDoc.
- `src/config/election.test.js`: required keys and a test for the new block (sources are
  `revisor.mo.gov` section 115.430 and `sos.mo.gov`, phone shape).
- `src/features/lookup/AssignedPollingPlace.jsx` (new): the rule, how to confirm, and
  sources. Takes a `linkClass`.
- `src/features/lookup/assignedPollingPlaceCopy.js` (new): its text.
- `src/features/lookup/AssignedPollingPlace.test.jsx` (new).
- `src/features/lookup/HomePage.jsx`, `homeCopy.js`, `HomePage.test.jsx`: the box shows the
  component instead of the vote-anywhere line.
- `src/features/lookup/PollsCard.jsx`, `resultsCopy.js`, `PollsCard.test.jsx`: the nearest
  note before the list, the component after the hours, the early voting pointer; the
  vote-anywhere line and test go.
- `src/features/lookup/nearbyPolls.js`: header comment.
- `docs/data.md`: section 2 and the Election config paragraph.
- `src/features/learn/learnCopy.js`: the `/learn` lookup link said "Look up your polling
  place"; it now says "nearby polling places" (review finding 1).

## Order of work

1. Tests first (red): election config block, AssignedPollingPlace, HomePage, PollsCard.
2. Config, component and copy; wire into HomePage and PollsCard.
3. Comments and docs/data.md.
4. Full gate.

## Risks

- Saying "must" too strongly: the statute and SOS also allow a central polling place. The
  component adds the SOS's own hedged sentence about it, since no topic on `main` covers it
  yet (review finding 2).
- Duplicate link names: the hours already link "Missouri law" (115.407); the new link is named
  "Missouri law (section 115.430)" so the two differ.
- Layout shift (#27): the new note before the list is static and shows while loading.
- The Voter Outreach Center blocks automated requests (403 to curl), as it already did for
  the out-of-county notice that links it; the link is the one the county's own apps use.

## Proof

- `election.test.js`: criterion 5.
- `AssignedPollingPlace.test.jsx`: criteria 2, 3 and 6 (link targets and hosts).
- `HomePage.test.jsx`, `PollsCard.test.jsx`: criteria 1 to 4 on each page.
- A grep for "any polling place" over `src`, `e2e`, `scripts`, `README.md`, `docs/data.md`:
  criterion 1.
- Live drive: build and preview, open `/` and `/p/CC007`, read the new text and links.
