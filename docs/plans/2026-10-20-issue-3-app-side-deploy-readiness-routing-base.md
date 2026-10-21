# Plan: App-side deploy readiness: routing, base path, and post-deploy smoke test (issue #3)

Risk tier: Medium. Not a forced-High area. Raised from Low once because client routing is
stateful UI that unit tests cannot fully exercise (history, hard loads, the host rewrite), and
once more for touching more than a few files, then rounded to Medium: every route and every
smoke check can still be proven by a test or a live run.

Domain skills:
- vercel-react-best-practices: invoke. The router and page components are React code.
- context7 (docs lookup): invoke. Checked the wouter 3 API (Switch, default Route, useParams,
  memoryLocation) against current docs instead of memory.
- frontend-design: not applicable because the pages are minimal placeholders; the landing,
  results and learn designs belong to #10, #11 and #23.
- expo, django, fastapi, dataviz, claude-api: not applicable because none of those stacks or
  outputs are involved.

Scope decisions (user, 2026-10-20):
- #31 (render.yaml Blueprint) is still open, so this run does the app side only. Running the
  smoke test against a Render PR preview and production waits for #31. The PR says `Refs #3`,
  not `Closes #3`.
- Router: wouter 3 (about 2 KB, hooks API, Switch with a default route).
- The not-found page links home only. #10 adds the address search to it when the search exists.

## Acceptance criteria

1. Vite `base` is `'/'`, and a test fails if it changes. The built `dist/index.html` loads its
   script and stylesheet from `/assets/...` (root-absolute), so a hard load of a nested path
   like `/p/CC007` still finds them.
2. Path-based routing (no hash) renders a distinct page for `/`, `/p/:precinct`, `/learn` and
   `/learn/:topic`. The precinct page shows the precinct code from the URL. Links between pages
   change the path without a full reload.
3. Any other path, including deeper paths under known prefixes (`/p/CC007/extra`,
   `/learn/a/b`), renders an in-app "Page not found" page inside the `<main>` landmark, with an
   `<h1>` and a link to `/`. Never a blank screen.
4. CI's build output check asserts: `dist/index.html` exists, hashed JS and CSS exist under
   `dist/assets/`, and `dist/index.html` references them by root-absolute `/assets/` paths. A
   comment marks where #25 adds `sw.js` and `manifest.webmanifest`.
5. `scripts/smoke.mjs <base-url>` (also `npm run smoke -- <base-url>`) checks, and exits
   non-zero with a readable list of failures when any fails:
   a. `/` returns 200 with an HTML app shell (the `#root` element and a module script from
      `/assets/`);
   b. a hard load of `/p/CC007` returns 200 with the same app shell (same script path), served
      at that path: a redirect to another path fails (scheme or host redirects may happen);
   c. the hashed script found in the shell returns 200 with a JavaScript content type (so the
      host rewrite does not catch real files);
   d. the expected headers are present: `Referrer-Policy: no-referrer`,
      `X-Content-Type-Options: nosniff`, a `Permissions-Policy`, a `Content-Security-Policy` or
      `Content-Security-Policy-Report-Only` on `/`; `Cache-Control` containing `no-cache` on
      `/`; `Cache-Control` containing `immutable` on the hashed asset. These are the values #31
      proposes; #31 updates the table if its final config differs.
   `--skip-headers` skips (d) for hosts that set none, such as local `vite preview`.
6. The smoke script passes against a local `npm run preview` of the real build with
   `--skip-headers`, and fails (exit 1) against a server that 404s deep links, serves HTML for
   the asset, or omits the headers.
7. README notes how to run the smoke test.
8. Deferred, not met by this run: the smoke test passes against a Render PR preview and
   production (needs #31).

## Files that change

- `package.json`, `package-lock.json`: add `wouter` (dependency); add the `smoke` script.
- `src/App.jsx`: the layout `<main>` plus a wouter `Switch` with the four routes and a default
  not-found route.
- `src/features/lookup/HomePage.jsx`: the current heading, moved out of `App.jsx`.
- `src/features/lookup/PrecinctPage.jsx`: placeholder that shows the precinct code from the
  URL, and a link home. Real content is #11 and #17.
- `src/features/learn/LearnPage.jsx`, `src/features/learn/LearnTopicPage.jsx`: placeholders
  with a heading; the learn page links home and a topic page links to `/learn` ("All
  topics"). Real content is #21 to #23; unknown topics turn into not-found there, once topics
  exist.
- `src/components/NotFoundPage.jsx`: "Page not found" heading, a short sentence, and a link to
  `/`.
- `src/App.test.jsx`: route tests rendered through `memoryLocation`.
- `scripts/smoke.mjs`: the smoke test, exporting `runSmoke(baseUrl, { checkHeaders })` for
  tests and running as a CLI when invoked directly.
- `src/test/smoke.test.js`: runs `runSmoke` against `vite preview` of a real build in a temp
  dir, and against stub `node:http` servers for each failure mode.
- `src/test/tooling.test.js`: assert `viteConfig.base === '/'`.
- `src/test/build.test.js`: assert built `index.html` references `/assets/` root-absolute.
- `.github/workflows/ci.yml`: extend the build output check (criterion 4).
- `README.md`: one short smoke test section.
- `docs/plans/2026-10-20-issue-3-app-side-deploy-readiness-routing-base.md`: this plan.

## Order of work

1. Install wouter.
2. Red: route tests in `App.test.jsx` (four routes, not-found for unknown and too-deep paths,
   link navigation). Then the page components and `App.jsx` routing until green.
3. Red: `base` test in `tooling.test.js` and the root-absolute asset test in `build.test.js`
   (these pass already; they are guards, so confirm each fails when `base` is set to `'./'`,
   then restore).
4. Red: `smoke.test.js` against stub servers and a real preview. Then `scripts/smoke.mjs` until
   green. Add the `smoke` npm script.
5. CI build output check.
6. Full gate, then live drive: `npm run build && npm run preview`, browser hard loads of each
   route and an unknown path, then `npm run smoke -- http://localhost:4173 --skip-headers`.
7. README (Phase 8).

## Risks

- The host rewrite (#31) and routes must agree. Path routing only works on Render because #31
  rewrites `/*` to `/index.html`; until #31 merges, a deploy would 404 deep links. Nothing
  deploys until #31, so no live user is affected.
- `base` change would break deep links silently (assets resolved relative to `/p/`). Guarded by
  criteria 1 and 4.
- Header expectations in `smoke.mjs` are a guess at #31's final config. Kept in one table at the
  top of the script so #31 edits one place; the README says so.
- The smoke test's preview-based test starts a real server on a random port; it must always
  close it, or the suite hangs. Use `afterAll` with `server.close()` and port 0.
- Placeholder pages could leak into production looking like real content. They say nothing
  factual about the election (no dates, places or rules), so they cannot mislead.
- Out of scope, noted for #26: moving focus and announcing the new page on client navigation.
  For #17: validating the precinct code format.

What I chose not to do: mirror the #31 headers in `vite preview` config (would duplicate
`render.yaml` and drift); parse `render.yaml` in the smoke script (needs a YAML dependency and
the file does not exist yet); add a `404.html` (the host rewrite means the host never serves
one).

## Proof

- Criterion 1: `tooling.test.js` (`base`), `build.test.js` (root-absolute assets).
- Criteria 2, 3: `App.test.jsx` route tests; live drive hard-loads `/`, `/p/CC007`, `/learn`,
  `/learn/voter-id`, `/nope` and `/p/CC007/extra` in a browser on `vite preview` and shows each
  page, then clicks a link and confirms no full reload.
- Criterion 4: CI step, run locally verbatim after `npm run build`.
- Criteria 5, 6: `smoke.test.js`; live run of `npm run smoke -- http://localhost:4173
  --skip-headers` (exit 0) and without `--skip-headers` (exit 1, lists the missing headers).
- Criterion 7: README diff.
- Criterion 8: deferred to #31; stated in the PR.

### Defects found in review (frozen tests in `src/test/smoke.test.js`)

Phase 5 finder 2 found two ways the smoke test passed when it should fail. Each test was
written first and failed before the fix in `scripts/smoke.mjs`:

1. A host that answers `/p/CC007` with a redirect to `/index.html` (a `redirect` route where
   #31 needs a `rewrite`) passed every check, because `fetch` follows redirects. The voter
   would land on `/index.html`, which the app shows as not found. Fix: the shell checks fail
   when the response's final path differs from the requested one. Scheme and host redirects
   (http to https) still pass.
   Red run: `× fails when a deep link redirects to the shell instead of being rewritten`,
   `AssertionError: expected [] to deeply equal [ Array(1) ]` (no check failed).
2. Run through a symlinked path, the CLI did nothing and exited 0, because the "run as a
   script" guard compared `argv[1]` (not resolved) with `import.meta.url` (resolved). Fix:
   compare real paths.
   Red run: `× still runs when invoked through a symlinked path`,
   `AssertionError: promise resolved "{ stdout: '', stderr: '' }" instead of rejecting`.
