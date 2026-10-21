# Plan: "How to vote" section UI (issue #23)

Risk tier: Medium. Low base, raised one for a front matter schema change (a new required
`group` key that #22's topics must carry) and one for touching more than a few files (two
pages, the renderer, two result cards, copy, CSS, the Markdown checker). It adds UI rather
than altering existing behavior, apart from two card links that change only once topics
exist. No auth, money, data writes or outward messages. The orchestrator's run instructions
stand in for the Medium plan approval (autonomous batch run); noted in the PR.

Domain skills: vercel-react-best-practices: invoke (new React pages and an effect).
frontend-design: not applicable because the pages reuse the existing tokens, text and link
styles; no new visual language. chrome-devtools-mcp a11y-debugging: invoke for the live drive
(axe criterion, keyboard and `<details>` behavior in a real browser). humanizer: not applicable
beyond a few labels and one empty-state paragraph, written plainly. Django, FastAPI, Expo,
payments, email: not applicable because the app is a frontend-only React site.

## Scope limits

- No real voter education content. `content/en/learn/` stays empty: #22 (drafting topics) is
  parked awaiting an owner decision. Tests use fixture topics built in memory.
- Do not touch #58's files (geocoder, `render.yaml` CSP `connect-src`, `privacyCopy.js`).
  `render.yaml` gets one comment edit only.

## Acceptance criteria

1. `/learn` shows an `h1` "How to vote". With topics, it lists every topic as a link to
   `/learn/<id>`, under `h2` groups in this order: "Before you vote", "Ways to vote", "At
   the polls", "Get help". A group with no topics is not shown. Within a group, topics sort by
   title, under a one-line intro. Below the list, a "More help" nav links to the address
   lookup and the county board's site. Like topic pages, `/learn` sets the tab title and
   moves focus to its `h1` on arrival (links to it sit low on other pages).
2. With zero topics, `/learn` says plainly that the guides are not ready yet, and links to the
   county board's official site (`election.countySiteUrl`) and to the address lookup (`/`).
   It invents no voter guidance.
3. Each topic declares its group in front matter (`group: before-you-vote | ways-to-vote |
   at-the-polls | get-help`). A missing or unknown group fails the build, naming the file.
4. `/learn/<id>` renders that topic with `TopicArticle` (title, body, numbered citations,
   Sources list, "Last checked against these sources on <date>."). An unknown id shows the
   not-found page. The page links back to `/learn`, sets the tab title to the topic's title,
   and moves focus to its `h1` on arrival.
5. A `##` section whose text is long (at least `LONG_SECTION_CHARS`, 600 characters) renders
   as `<details>`/`<summary>` with the `h2` inside the summary; short sections render as plain
   headings. Before printing, every folded `<details>` is opened, and after printing those are
   folded again. Moving to another topic starts it with its sections folded. Headings may hold
   only text and bold (the build rejects links and citations in them), so a summary never
   contains a link.
6. Heading order is correct: the build rejects a `###` heading that comes before any `##`
   heading, so a page never jumps from `h1` to `h3`. All link text is descriptive (topic
   titles, source labels, named destinations; no "click here").
7. The polling places card links to the `voter-id` topic (link text is the topic's title,
   after "Before you go:") when that topic exists, and shows nothing extra when it does not. The early voting card's
   mail and absentee line links to the `absentee` topic when it exists, and to `/learn`
   otherwise (today's behavior).
8. Print styles: the site footer and page navigation links are hidden in print; external links
   in a topic (body links and the Sources list, not the numbered citations, whose URLs the
   Sources list prints) print their URL after the text.
9. axe (axe-core, run in the tests) reports no violations on `/learn` empty, `/learn` with
   fixture topics, and every fixture topic page, including one with a collapsible section.
10. Docs: README "Learn content" describes `group`, the card topic ids and the pages;
   `render.yaml`'s comment that content "will be" built into the learn pages becomes present
   tense.

## Files that change

- `src/features/learn/content/topic.js` (+ test): required `group` key, validated against
  `TOPIC_GROUPS` exported from a new `src/features/learn/groups.js` (browser-safe; the bundle
  test forbids app code importing `content/topic.js`).
- `src/features/learn/content/markdown.js` (+ test): `###` before any `##` is an error, and
  so is a link or citation in a heading.
- `src/features/learn/content/vitePlugin.test.js`: its fixture topic gains `group`.
- `src/App.test.jsx`: the routing tests use fixture topics, since `/learn/:topic` now shows
  the not-found page for an id with no topic.
- `src/features/learn/groups.js` (new): group ids in display order.
- `src/features/learn/learnCopy.js`: page labels, group labels, empty state.
- `src/features/learn/LearnPage.jsx` (+ new test): index and empty state.
- `src/features/learn/LearnTopicPage.jsx` (+ new test): topic page, not found, title, focus,
  beforeprint.
- `src/features/learn/TopicArticle.jsx` (+ test): sections, `<details>` for long ones,
  `headingRef` prop, print URL class.
- `src/features/learn/cardTopics.js` (new): `CARD_TOPICS = { voterId: 'voter-id', absentee:
  'absentee' }`.
- `src/features/lookup/PollsCard.jsx`, `EarlyVotingCard.jsx`, `resultsCopy.js` (+ tests).
- `src/components/SiteFooter.jsx`: `print:hidden`.
- `src/index.css`: print rule for topic link URLs.
- `src/features/learn/learnA11y.test.jsx` (new): axe runs.
- `package.json`, `package-lock.json`: `axe-core` dev dependency.
- `src/test/learnFixtures.js` (new): fixture topics shared by the page, card and axe tests.
- `src/test/build.test.js`: the built CSS has the print rules.
- `README.md`, `render.yaml` (comment only). `docs/progress.md` is left to the batch
  orchestrator, which writes its lines.

## Order of work

1. `group` key and the heading order rule, tests first.
2. `TopicArticle` sections and `<details>`, tests first.
3. `LearnPage`, `LearnTopicPage`, tests first (topics module mocked with fixtures).
4. Card links, tests first.
5. Print CSS, footer.
6. axe tests.
7. Docs.

## Risks

- Heading inside `<summary>`: some screen readers announce the summary as a button and the
  heading semantics with it. Chrome and Firefox keep the heading in the accessibility tree;
  checked with axe and in a real browser in the live drive.
- Collapsed content is hidden from print and find-in-page. Mitigated by opening all `<details>`
  on `beforeprint`; find-in-page auto-expands in Chromium (`hidden=until-found` behavior for
  details).
- The `group` key is a schema change #22 must follow: documented in the README and the error
  message lists the allowed values.
- Mocking `topics.js` in tests: the real module stays covered by its own test.

## Proof

- Criterion 1, 2: `LearnPage.test.jsx`. 3: `topic.test.js`. 4: `LearnTopicPage.test.jsx`.
  5: `TopicArticle.test.jsx`, `LearnTopicPage.test.jsx`. 6: `markdown.test.js`, axe.
  7: `PollsCard.test.jsx`, `EarlyVotingCard.test.jsx`. 8: CSS inspected in the build and the
  live drive. 9: `learnA11y.test.jsx`.
- Live drive: `npm run build && npm run preview`, open `/learn` (empty state, both links
  work), `/learn/unknown` (not found), and run axe in the browser. With a temporary fixture
  topic file (removed afterwards, never committed) built into the preview: the index groups,
  a topic page, `<details>` toggling, print emulation.
