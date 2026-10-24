# Plan: City early voting card links the absentee topic (issue #168)

Risk tier: Low. A link and copy change on one card in the lazy City chunk, plus a test for the
City polling places card's existing voter ID link; all of it is unit testable and it adds no
data, request or state.

Domain skills: superpowers:test-driven-development, invoke. vercel-react-best-practices: not
applicable because no rendering, data fetching or bundle structure changes (the card already
imports from `EarlyVotingCard.jsx`, which is in the first load). Accessibility: covered by
reusing the County card's existing link line; no new control. Data skills: not applicable, no
layer or config change.

## Acceptance criteria

1. The City early voting card's mail line links the absentee topic (`/learn/absentee`, by its
   title) and the City Board's Apply to Vote Absentee page, in the County card's shape:
   "To vote by mail or with an absentee ballot, see <topic> or the <City Board site>."
2. The card still names no County text and links no County host.
3. The card's comment and its test no longer say the absentee topic is the County's.
4. The City polling places card's voter ID link (`/learn/voter-id`, already shown for every
   jurisdiction) is covered by a City test. No `what-to-expect` link is added to either card:
   the County card does not link it, and the issue asks for parity with the County cards.
5. The now unused `results.earlyVoting.mailCity` string is removed from `src/i18n/en.json`, so
   first-load JS does not grow; `src/test/build.test.js` stays green under its 120 KB budget.

## Files that change

- `src/features/lookup/CityEarlyVotingCard.jsx`: replace the City mail paragraph with
  `MailLine` from `EarlyVotingCard.jsx` (href the Apply to Vote Absentee page, label its
  `sourceName`); update the component comment.
- `src/features/lookup/CityEarlyVotingCard.test.jsx`: assert the topic link and the mail line
  text; drop the "no /learn link" assertion.
- `src/features/lookup/PrecinctPage.city89.test.jsx`: assert the City polling places card links
  `/learn/voter-id`.
- `src/i18n/en.json`: remove `results.earlyVoting.mailCity`.

## Order of work

1. Change the City card test to expect the topic link; run it red.
2. Switch the card to `MailLine`; remove the string; run green.
3. Add the City polling places voter ID test (passes already: it documents the check).
4. Full gate: lint, format check, tests, build (includes the first-load budget), e2e, perf.

## Risks

- First-load budget (about 178 bytes headroom): the City card is in `src/cityChunk.js`, and
  removing a string from `en.json` shrinks the first load; `build.test.js` proves it.
- `MailLine`'s "or the" join must read well with the City label; the test pins the sentence.

## Proof

- Criteria 1 to 3: `CityEarlyVotingCard.test.jsx` "cites the City Board ..." test.
- Criterion 4: the new `PrecinctPage.city89.test.jsx` test.
- Criterion 5: `src/test/build.test.js` in `npm test` after `npm run build`.
