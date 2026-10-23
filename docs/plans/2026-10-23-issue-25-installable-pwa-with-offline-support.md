# Plan: Installable PWA with offline support (issue #25)

Risk tier: Medium. No service worker; the only app code change is a small module that links the manifest
after load (see Risks). Installability and the
iOS home screen icon cannot be fully proven by unit tests (stateful browser behavior), it
touches several files (manifest, icons, `index.html`, `render.yaml`, CI, smoke test, docs),
and it reverses the #79 rule that no page links an icon.

Domain skills:
- superpowers:test-driven-development: invoke.
- frontend-design: not applicable because no UI is drawn; the icons are the #79 mark at new
  sizes.
- vercel-react-best-practices: not applicable because no React component changes; `main.jsx`
  only calls a plain function after rendering.
- chrome-devtools-mcp:a11y-debugging: not applicable because nothing a voter operates changes.
- chrome-devtools-mcp:debug-optimize-lcp: not invoked as a skill, but its concern applied: the
  Lighthouse gate caught a 150 ms LCP cost from the manifest link, fixed in Phase 4 (Risks),
  and the gate still runs and must stay green.

## Scope decision

Ship the safe scope: manifest, icons (192 and 512, maskable 192 and 512), the
apple-touch-icon link and installability. **No service worker.** Offline caching, the
update flow and the offline page move to #183.

Why: Election Day is November 3, 2026, 11 days out. A service worker is sticky: a bug in
its caching or update flow keeps serving old hours, polling places, wait times or ballot
links to voters until it updates, and every rule it needs (network-only for geocoders,
address and coordinate requests and wait times; polls capped by `layerMaxAge`) is new code
that would get days, not weeks, of real-device use before the election. Chrome and Edge no
longer require a service worker with a fetch handler to install a site, and iOS Add to Home
Screen never did, so installability does not depend on one. With no worker registered,
there is nothing to kill; #183 carries the kill switch (a self-destroying `/sw.js`) as a
task to do before its worker ships.

## Acceptance criteria

1. `dist/manifest.webmanifest` is a valid web app manifest: `name` is the site name in
   `src/i18n/en.json` (`site.name`), `short_name` is at most 12 characters, `start_url`,
   `scope` and `id` are `/`, `display` is `standalone`, `lang` is `en`, `description` is
   `site.description`.
2. Its `theme_color` and `background_color` are the light `theme-color` meta in
   `index.html` (the light surface token, #76), neither red nor blue.
3. It lists PNG icons at 192 and 512 px with `purpose: "any"` and maskable ones at 192 and
   512 px with `purpose: "maskable"`; each file exists in `dist/` at the size it declares.
   The maskable icons keep the mark inside the central 80% safe zone with the brand fill
   to the edges.
4. The built home page and shell (so every pre-rendered page too) link
   `/apple-touch-icon.png` with `rel="apple-touch-icon"`. No other icon link is added. The
   manifest is linked by the first-load script (`src/linkManifest.js`) 10 seconds after the
   load event, at idle time (bounded to 2 s, added in Phase 7), never from the HTML (revised during Phase 4, see below).
5. Chromium reports no installability errors for `/` on the production build
   (`Page.getInstallabilityErrors` in Playwright), the issue's "Lighthouse PWA
   installability checks" criterion, since Lighthouse 13 no longer has a PWA category.
6. No service worker is registered and `dist/` has no `sw.js`: a build test fails if one
   appears without its own tests (#183 removes that guard when it adds the worker).
7. `render.yaml` sends `Cache-Control: no-cache` for `/manifest.webmanifest`; no two
   Cache-Control rules match any path; the CSP is unchanged (`manifest-src 'self'` already
   allows it; images in a manifest load under `img-src 'self'`).
8. `npm run smoke` checks that `/manifest.webmanifest` is a real file (not the app shell)
   whose JSON names the site, on production and previews.
9. CI's build output check checks `dist/manifest.webmanifest` and the icons.
10. The README says what is installable, that there is no service worker and why, where
    the icons come from and how to redraw them, and points every remaining "#25" offline
    reference in the README and code comments at #183 (revised in Phase 7: `docs/progress.md` is
    not edited by issue runs, and dated plans under `docs/plans/` are historical records).
11. First-load JS and Lighthouse budgets unchanged and green.

## Files that change

- `public/manifest.webmanifest` (new)
- `public/icons/icon-192.png`, `icon-512.png`, `maskable-192.png`, `maskable-512.png` (new,
  drawn from `public/favicon.svg` by `scripts/draw-icons.mjs`, new, with Playwright's Chromium)
- `index.html`: the apple-touch-icon link
- `src/linkManifest.js`, `src/linkManifest.test.js` (new), `src/main.jsx`: the manifest link
  added after load
- `src/test/manifest.test.js` (new): criteria 1 to 3
- `src/test/build.test.js`: the #79 icon test becomes criterion 4; criterion 6
- `e2e/install.e2e.js` (new): criterion 5
- `render.yaml`, `src/test/render.test.js`: criterion 7
- `scripts/smoke.mjs`, `src/test/smoke.test.js`, README Smoke test: criterion 8
- `.github/workflows/ci.yml`: criterion 9
- `README.md`, comments naming #25 for offline work (`render.yaml`,
  `src/test/addressPrivacy.test.jsx`, `src/test/build.test.js`): criterion 10

## Order of work

1. Tests first: `manifest.test.js`, the build test changes, render test, smoke test; see
   them fail.
2. Draw the icons, write the manifest, add the links, the render rule, the smoke check.
3. `e2e/install.e2e.js`, CI check.
4. README and comments.

## Risks

- `index.html` also changes in #77 (open PR #182, per-scheme `theme-color`). Keep both on
  rebase; the manifest test reads the light meta in either form.
- Render's Content-Type for `.webmanifest` is unknown; browsers parse a manifest whatever
  its type, so the smoke check reads the JSON and does not require a type.
- The apple-touch-icon link changes nothing for browsers that already found the file at
  the root; it stops iOS from first requesting the `-precomposed` variants, which Render
  answers with the app shell.
- Adding links to the head adds requests. Revision during Phase 4: with the manifest link
  in `index.html`, Chromium fetched the manifest at once (Medium priority, beside the app's
  script) and then a manifest icon, and the Lighthouse runs lost about 150 ms of LCP on `/`,
  `/early-voting` and the precinct pages (a touch icon link alone measured the same as
  `main`). Linking it at the load event still fired before a precinct page's data arrived.
  So `src/linkManifest.js` links it from the app's script 10 seconds after load, at idle
  time: Chrome's install prompt needs engagement first anyway, and iOS reads links only
  when Add to Home Screen is tapped (before then it uses the touch icon and title). The
  cost is a few hundred bytes of first-load JS.

What I chose not to do: no service worker, no `vite-plugin-pwa` dependency, no
`<link rel="icon">` (the #79 root icons are found without one), no install prompt UI.

## Proof

- Criteria 1 to 3: `src/test/manifest.test.js`.
- Criteria 4 and 6: `src/test/build.test.js`; the delayed manifest link:
  `src/linkManifest.test.js`.
- Criterion 5: `e2e/install.e2e.js` in `npm run test:e2e`.
- Criterion 7: `src/test/render.test.js`.
- Criterion 8: `src/test/smoke.test.js` (stub hosts and the real preview build).
- Criterion 11: `npm test` (build test budget) and `npm run test:perf`.
- Live drive: `npm run build && npm run preview`, then in Chromium confirm the manifest
  loads with no errors and icons, `/apple-touch-icon.png` is linked, and no service worker
  is registered. Manual for the owner: Add to Home Screen on a real iPhone and install on
  Android Chrome.
