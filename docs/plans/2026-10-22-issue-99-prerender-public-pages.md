# Plan: Pre-render the home, learn, topic and privacy pages to static HTML (issue #99)

Risk tier: High. Hydration is behavior unit tests cannot fully exercise (it needs a real
browser and the real build), the change alters what the host serves for `/` and every
deep link (a new app shell file and a new rewrite target in `render.yaml`), and it touches
more than a few files (the build, the entry point, `App.jsx`, the smoke test, the Blueprint,
the README). No auth, money, data or outward messages, so not forced High; rounded up.

Domain skills: superpowers:test-driven-development, invoke. vercel-react-best-practices,
invoke (server rendering and hydration rules for React). chrome-devtools-mcp:a11y-debugging,
not applicable because the Playwright plus axe e2e suite already audits every route in a
real browser and this run adds the pre-rendered routes to it. frontend-design, dataviz:
not applicable because nothing visual changes. chrome-devtools-mcp:debug-optimize-lcp: not
applicable because the Lighthouse budgets in `npm run test:perf` gate LCP and CLS. Django,
FastAPI, Expo: not applicable because this is a static Vite site.

Plan approval: given by the coordinator's brief for this batch run (the user launched it to
work #99 end to end), as for #97.

Dependency on #98: #98 (page metadata) is still open with owner decisions pending on precinct
page `noindex` and a share image. This plan decides neither. It adds only what #99 itself
lists: each pre-rendered page's own title, description, canonical and `og:*` tags. Precinct
pages, the not-found page and the error page keep exactly the head they have today (the
shell's title and description, no canonical, no `og:*`), which #98 then changes. #98 can
build its head hook on the `pageHead()` function added here.

## Acceptance criteria

1. `npm run build` writes, next to the built shell, a static HTML file per public page:
   `dist/index.html` (`/`), `dist/learn/index.html`, `dist/learn/<id>/index.html` for every
   English topic under `content/en/learn/`, and `dist/privacy/index.html`. Each has the
   page's rendered markup inside `<div id="root" data-prerendered="<path>">` (the topic's
   `h1`, its text), and in its head its own `<title>`, `<meta name="description">`,
   `<link rel="canonical" href="https://mapthevotestl.com<path>">` and `og:type`,
   `og:site_name`, `og:title`, `og:description`, `og:url`. Everything is readable with
   JavaScript off.
2. The routes come from the same list the sitemap uses (`/`, `/learn`, each topic,
   `/privacy`), so a new topic is pre-rendered on the next build with no hand-kept list.
3. `dist/shell.html` is the unchanged client-rendered shell (empty `#root`, the shell's
   title and description, no canonical, no `og:*`). `render.yaml` rewrites every path with
   no file to `/shell.html` (was `/index.html`), so precinct pages (`/p/*`) and unknown paths
   stay client-rendered and no live data is ever baked into a build. `/shell.html` has its
   own `no-cache` rule; the pre-rendered files fall under the existing `/`, `/index.html`,
   `/learn`, `/learn/*`, `/privacy` and `/privacy/*` `no-cache` rules; no two rules match one
   path.
4. `src/main.jsx` hydrates (`hydrateRoot`) when `#root` holds pre-rendered markup for the
   current path (its `data-prerendered` equals the path, trailing slash ignored), and
   otherwise renders fresh (`createRoot`, clearing any markup), so a pre-rendered file served
   at another path (`/index.html`) never hydrates the wrong page. No hydration errors or
   warnings in the console on any pre-rendered route.
5. Code that runs at module load or during render is safe in Node: the `popstate` listener
   in `App.jsx` is added only where `window` exists.
6. On in-app navigation the description, canonical and `og:*` tags follow the page (an
   App-level effect from `pageHead()`), and on a page with no entry (precinct, not-found, an
   unknown topic) they go back to the shell's: the shell's description, no canonical, no
   `og:*`. Titles stay managed by the pages as now; `pageHead()`'s title equals the title
   each page sets.
7. Descriptions are the page's own text, never new claims: home and shell, the existing
   `index.html` description (#71's wording, moved to `site.description` in `en.json` with a
   test keeping `index.html` the same); `/learn`, the page's intro; `/privacy`, the notice's
   intro; a topic, its first paragraph without citation marks. Each is cut to at most 155
   characters at a word boundary, ending in an ellipsis when cut. No head tag holds a query
   string, hash, address or coordinates.
8. `vite preview` (and so `npm run test:e2e` and `npm run test:perf`) serves the files the
   way Render does: `/learn` and `/learn/` the directory's `index.html`, and any path with no
   file the shell.
9. `npm run smoke` also checks that a hard load of `/learn` and of one topic returns HTML that
   already contains the page's `h1` and canonical, and that `/p/CC007` returns the shell with
   no pre-rendered markup.
10. The full gate passes, including the 120 KB first-load JS budget (`src/test/build.test.js`),
    the e2e accessibility checks (focus after an in-app link, the skip link) on the
    pre-rendered routes, and the Lighthouse budgets.
11. The Render behavior (the spike) is checked on this PR's preview and written up on the
    issue: `/learn/voter-id` and `/learn/voter-id/` both serve the pre-rendered file (or what
    Render does instead), and `/p/CC007` gets the shell.

## Files that change

- `src/config/publicPages.js` (new) and its test: `publicPaths(topicIds)`, the one list of
  public pages that both the sitemap (`searchEngines.js`) and the pre-render use.
- `src/pageHead.js` (new): `prerenderPaths()`, `normalizePath(path)`, `pageHead(path)`
  returning `{ title, description, canonical }` for public pages or `null`, `shellHead()`,
  `describe(text)` (the 155 character cut), `topicDescription(topic)`, `headTags(head)` and
  `applyHead(document, head)`.
- `src/pageHead.test.js` (new).
- `src/App.jsx` holds the head effect (a `PageHead` component rendered after the page and
  inside the error boundary, so the error screen, which writes the shell's head itself in
  `src/components/ErrorBoundary.jsx`, never gets the failed page's head) that writes the head tags for the
  current location, and sets a public page's title too: each page puts back the title it
  found when it goes, and on a pre-rendered page that chain starts from the pre-rendered
  title, so without it the home page (which sets no title) would keep a topic's title.
- `src/pageHeadApp.test.jsx` (new): the head on navigation.
- `src/hydrate.js`, `src/hydrate.test.js` (new): the hydrate-or-render decision, and
  `focusHeadingOnArrival()`, which `LearnPage`, `LearnTopicPage` and `PrivacyPage` now use:
  a pre-rendered page can be scrolled or tabbed through before its script arrives, and
  hydrating it must not pull focus or the scroll position back to the heading.
- `src/components/NotFoundPage.jsx`: its comment (the rewrite target).
- `src/features/learn/content/searchEngines.js` and its test: the sitemap uses
  `publicPaths()`; the preview `noindex` check covers `shell.html` and a topic page.
- `src/entry-server.jsx` (new): `render(path)` with `renderToString` inside
  `<Router ssrPath>`, `renderRoute(path, template)` for the whole page, and
  `prerenderPaths` re-exported.
- `src/prerender/html.js` (new): pure functions that put the head tags and the markup into
  the built `index.html` template (escaping attribute values, failing loudly when the
  template does not have the expected title, description or root).
- `src/prerender/html.test.js` (new).
- `src/prerender/plugin.js` (new): the Vite plugin. In `closeBundle` of a client build it
  copies the built `index.html` to `shell.html` and runs `src/prerender/worker.js` in a
  worker thread, which starts a Vite server in middleware mode, `ssrLoadModule`s the server
  entry, writes each route's file (`src/prerender/outputFile.js` names it), then closes the
  server. A worker, because the build test builds from inside Vitest, whose process already
  loaded React in another mode (a mismatched React and react-dom/server). A second plugin,
  preview only, serves directory indexes and falls back to `shell.html` for page requests
  (the same Accept and `/favicon.ico` test Vite's own fallback uses, so the Lighthouse run
  loads no extra file).
- `src/prerender/plugin.test.js` (new).
- `vite.config.js`: add both plugins.
- `src/main.jsx`: hydrate or render.
- `src/App.jsx`: guard the `popstate` listener; call the head effect.
- `src/i18n/en.json`: `site.name`, `site.description`.
- `index.html`: unchanged text (a test ties its title and description to `en.json`).
- `render.yaml`: rewrite destination `/shell.html`; `Cache-Control: no-cache` on
  `/shell.html`; the routes comment.
- `src/test/render.test.js`: the new rewrite target and `/shell.html` in the probe and shell
  paths.
- `src/test/build.test.js`: assertions on the pre-rendered files and the shell.
- `scripts/smoke.mjs`, `src/test/smoke.test.js`: the pre-rendered page checks.
- `e2e/prerender.e2e.js` (new): JavaScript-off content and head on each pre-rendered route,
  no console errors or page errors after hydration, precinct link served the empty shell,
  interactive behavior (the home combobox, a topic's folded section, an in-app link).
- `e2e/a11y.e2e.js`: add a topic route to `ROUTES`.
- `README.md`: Deploy (rewrite target, shell file), Search engines (pre-rendered pages),
  Development if needed.

## Order of work

1. `pageHead.js` and its tests (TDD): normalization, descriptions, canonical, null for
   precinct and unknown paths.
2. `prerender/html.js` and tests (TDD): template injection and escaping.
3. Guard `App.jsx`'s listener; `entry-server.jsx`; a unit test that renders each route to a
   string in Node without throwing and contains its `h1`.
4. The head effect in `App.jsx` with tests (navigation from a topic to the privacy page to a
   precinct page and back).
5. `main.jsx` hydrate or render, with a unit test for the decision function.
6. The Vite plugins and `vite.config.js`; `build.test.js` assertions (TDD against the real
   build).
7. `render.yaml` and `render.test.js`.
8. Smoke script and its test.
9. e2e spec; run the full gate.
10. README.

## Risks

- Riskiest: hydration mismatch. Anything that renders differently in Node and the browser
  (time, locale, `navigator`) breaks hydration. Mitigation: the e2e spec fails on any console
  error or page error on every pre-rendered route; `data-prerendered` stops a file served at
  the wrong path from hydrating.
- `/` is now the home page file, not the shell. Every deep link must go to `shell.html`, on
  Render (rewrite target) and in `vite preview` (the preview plugin), or a precinct link would
  flash the home page. The smoke test and the e2e spec both check `/p/CC007` gets an empty
  root.
- The nested Vite server inside the build: it loads `vite.config.js` again. The prerender
  plugins apply to `build` and `preview` only, so the nested `serve` does not recurse.
- An older deploy rolled back on Render keeps the current rewrite (`/shell.html`), which an
  older build does not have. Noted in the README's Rollback paragraph.
- A Render behavior that differs from the docs (directory index without the trailing slash).
  Checked on the PR preview before merge (criterion 11).
- Not done here, on purpose: `twitter:*` tags, a share image, precinct page and not-found
  `noindex`, the Lighthouse SEO category (all #98); the service worker precache (#25);
  per-locale pages (#19).

## Proof

- Criterion 1, 2, 3: `src/test/build.test.js` against a real build (files, head tags, root
  markup, shell unchanged); `src/prerender/html.test.js`.
- Criterion 3 (host): `src/test/render.test.js`.
- Criterion 4: a unit test of the hydrate-or-render decision; e2e console check.
- Criterion 5: the server entry test renders in the Node environment.
- Criterion 6: an App test navigating between routes and reading the head.
- Criterion 7: `src/pageHead.test.js`.
- Criterion 8, 10: `e2e/prerender.e2e.js` and `e2e/a11y.e2e.js` against `vite preview`;
  `npm run test:perf`.
- Criterion 9: `src/test/smoke.test.js`, and `npm run smoke -- <preview url> --preview`.
- Criterion 11: curl of the PR preview, recorded in the PR and on the issue.
- Live drive: build, `vite preview`, curl each route with no JavaScript, then Playwright on
  `/learn/voter-id` (open a section, follow an in-app link, check focus), `/` (type in the
  combobox) and `/p/CC007` (results render from the shell).
