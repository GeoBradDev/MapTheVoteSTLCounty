# Plan: Load the learn topic bodies with the learn pages (issue #147)

Risk tier: Medium. Changes existing behavior (topic data moves from eager to on-demand), adds
async loading to a stateful page and to hydration and the build's pre-render, across several
files; unit tests cover the lookups and the page, the e2e prerender checks cover hydration.
The owner's decision on #147 (keep the 120 KB budget, load the topic Markdown with the learn
pages) is the plan's approval.

Domain skills: vercel-react-best-practices: invoke (bundle splitting, async loading in a
component). superpowers:test-driven-development: invoke. frontend-design: not applicable
because no new visual design (a placeholder only). a11y-debugging: not applicable because the
e2e axe run already covers /learn/voter-id after hydration; focus behavior is unit tested.

## Acceptance criteria

1. The topic bodies (blocks and sources) are not in any first-load script; the first load
   carries only each topic's id, locale, title, group and description text.
2. The first-load JavaScript stays under 120 KB gzipped (budget unchanged) and gains several
   KB of room; `src/test/build.test.js` fails if a topic body reaches the first load.
3. Each topic body loads on demand, one chunk per topic file, when its topic page renders.
4. Pre-rendering still writes every topic page with its full text, title and description.
5. A pre-rendered topic page hydrates with no mismatch: its body is loaded before hydration,
   and the static HTML stays on screen meanwhile. If the body cannot load, the static page
   stays as it is (a plain page) rather than being replaced.
6. Navigating in-app to a topic shows a placeholder at least a screen tall while the body
   loads (no footer jump), then the topic, with focus on its heading.
7. A body that fails to load on in-app navigation shows the error screen (#18), not a blank
   page.
8. /learn, the cards' topic links and the page heads work with no body loaded.
9. Switching language on a topic page keeps the topic and focus while the translation's
   body loads (#19).

## Files that change

- `src/features/learn/content/topic.js`: `topicSummary(topic)`, the first-load fields plus
  `intro` (the first paragraph before any heading, as plain text without citations, or null).
- `src/features/learn/content/vitePlugin.js`: a topic file imported with `?meta` becomes its
  summary; without a query, the whole topic as before.
- `src/features/learn/topics.js`: summaries eager (`?meta` glob), bodies lazy (plain glob);
  `loadedTopic(topic)`, `loadTopic(topic)`, `loadAllTopics()`. A topic object that already
  carries `blocks` counts as loaded (test fixtures).
- `src/features/learn/LearnTopicPage.jsx`: renders the placeholder until the body is loaded.
- `src/pageHead.js`: `topicDescription` reads `topic.intro`.
- `src/main.jsx`, `src/hydrate.js` (`loadForHydration`): before hydrating a topic page, load
  its body; on failure leave the pre-rendered page alone.
- `src/entry-server.jsx`, `src/prerender/worker.js`: load every body before rendering.
- Tests: topic.test.js, vitePlugin.test.js, topics.test.js, LearnTopicPage.test.jsx,
  pageHead.test.js, entry-server.test.jsx, hydrate.test.js, build.test.js and
  e2e/prerender.e2e.js (in-app navigation with the chunk held back; a failed chunk on a hard
  load).
- README Learn content: the rule that topic bodies load with their page.

## Order of work

1. Test, then `topicSummary` in topic.js and the `?meta` transform.
2. Test, then topics.js loaders.
3. Test, then pageHead `intro`.
4. Test, then LearnTopicPage placeholder and error.
5. main.jsx, entry-server.jsx and worker.js loading; entry-server test.
6. build.test.js: no topic body text in the first load; measure the first load.
7. README.

## Risks

- Hydration mismatch if the body is not loaded first: main.jsx awaits it; the e2e prerender
  spec catches console hydration errors.
- Rolldown re-chunking shared code: body modules import nothing, so no shared module moves.
- Vite loading `x.md?meta`: falls back to reading the file without the query.

## Proof

- Criterion 1, 2: build.test.js (body text of voter-id absent from first load; budget).
- 3: build.test.js finds a voter-id body chunk; topics.test.js loader tests.
- 4: build.test.js pre-rendered page tests, entry-server.test.jsx.
- 5: e2e/prerender.e2e.js hydration checks; live drive of a hard load of /learn/voter-id.
- 6, 7, 9: LearnTopicPage.test.jsx; e2e/prerender.e2e.js navigating /learn to a topic.
- 5 (failure): e2e/prerender.e2e.js with the topic chunk aborted.
- 8: LearnPage, PollsCard, EarlyVotingCard, pageHead tests.

Revision after the first review: a failed body load before hydration now keeps the static page
(it used to clear it and render fresh), a language switch keeps the shown topic while the
translation loads, and the plugin accepts the dev server's `t` timestamp on both imports after an edit.
