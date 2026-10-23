# Plan: Tab title stays generic when going from /privacy straight to a precinct page (issue #128)

Risk tier: Low. A timing fix in three title effects, fully exercised by App navigation tests in jsdom; no data, API or visual change.

Domain skills: superpowers:systematic-debugging, invoke (bug); superpowers:test-driven-development, invoke; frontend-design and a11y skills, not applicable because nothing visual changes and the title rule (WCAG 2.4.2) is covered by the unit tests.

## Root cause

Still reproduces on main. Each page sets its tab title on arrival and puts back the title it found when it goes. The precinct page does both in a layout effect (#17, so content and title commit together). The privacy, not found, wait times and error pages (usePageTitle) and the learn pages (LearnPage, LearnTopicPage) do it in passive effects. On a navigation React runs the new page's layout effects before the old page's passive cleanups, so the old page's cleanup runs last and writes its old title over the precinct's. From the home page nothing is restored, which is why that path works.

## Acceptance criteria

1. Navigating straight from /privacy to a County precinct page (/p/CC007) leaves the tab title "Precinct CC007 | St. Louis Voter Guide".
2. The same holds for a City precinct page (/p/W01P12).
3. The same holds arriving from /learn, a learn topic, /early-voting and the not-found page.
4. Leaving a precinct page for a public page still gives that page's own title, and the home page still gets the site title.
5. Existing tests stay green, unchanged.

## Files that change

- src/components/usePageTitle.js: useEffect to useLayoutEffect.
- src/features/learn/LearnPage.jsx, src/features/learn/LearnTopicPage.jsx: their title effects to useLayoutEffect.
- src/pageHeadApp.test.jsx: new regression tests.
- README.md (Phase 8): the page rule says a page's own title effect is a layout effect, and why.

## Order of work

1. Red test in src/pageHeadApp.test.jsx, committed alone.
2. Switch the three title effects to layout effects, so every page's restore runs before the next page's set.

## Risks

- Server render: React 19 no longer warns about useLayoutEffect on the server; the build test and prerender would show it.
- App.jsx's PageHead stays a passive effect and still runs after the pages, so public pages keep their pre-rendered titles.

Not chosen: one central title manager in App.jsx. Larger, and it touches the pages other active runs are editing.

## Proof

- New tests in src/pageHeadApp.test.jsx cover criteria 1 to 4; they fail on main with the generic or old title.
- Revision after review: the first cases for /learn/voter-id and /early-voting passed on main, since they moved on before the topic body or the lazy wait times page loaded. Two async tests wait for each page to load first. Run against the merge-base code they fail ("What ID to bring | St. Louis Voter Guide" and "Privacy | St. Louis Voter Guide" instead of the precinct title); on the branch they pass. The earlier cases stay, unedited.
- Full gate: lint, format check, tests, build, e2e, perf.
- Live drive: built site, open /privacy then go to /p/CC007 and /p/W01P12, read document.title.
