# Plan: Google Analytics, cookieless page views with the precinct redacted (issue #69)

Risk tier: High. It adds a third party that receives data from every visitor, changes the
Content-Security-Policy and the privacy notice, and a leak (a precinct code, an address or a
coordinate reaching Google) cannot be taken back.

Domain skills: superpowers:test-driven-development, invoke. vercel-react-best-practices,
invoke (an effect in `src/App.jsx`, first-load budget). frontend-design, not applicable
because the only UI change is notice text in the existing layout. chrome-devtools a11y, not
applicable because no new controls; the existing axe e2e run covers `/privacy`.

Owner decision (2026-10-24, on the issue): ship with an empty measurement ID, so GA stays
off; the owner adds the `G-` ID in `src/config/site.js` and applies the GA property checklist
(README) later. Everything else ships now and is tested with GA forced on.

## Acceptance criteria

1. `src/config/site.js` has `gaMeasurementId`, empty. Empty (or not `G-` shaped) means GA is
   off: no `dataLayer`, no script tag, no request to Google.
2. GA loads only when the page's origin is exactly `siteUrl`, the ID is set, and
   `navigator.globalPrivacyControl !== true`. Never on previews, localhost, `vite preview`,
   e2e, Lighthouse or unit tests (unless a test passes those inputs itself).
3. The first `dataLayer` entry is `consent default` with `analytics_storage`, `ad_storage`,
   `ad_user_data` and `ad_personalization` all `denied`; nothing ever sends a consent
   `update`. `config` has `send_page_view: false`, `allow_google_signals: false`,
   `allow_ad_personalization_signals: false`, and no page fields; the redacted location,
   title and empty referrer are `set` before it (gtag ranks config over set, so a page field in
   config would outrank every later set).
4. The `gtag/js` script tag is added by a same-origin module (no inline script) after the
   `load` event, in idle time (bounded by a timeout), at most once.
5. One page view per navigation (first load included; StrictMode double effects and the
   lowercase precinct redirect `/p/cc007` to `/p/CC007` do not double count), with
   `page_location` = `siteUrl` + route pattern, `page_title` a fixed name per page type and
   `page_referrer` empty. The same values are `set` globally so GA's automatic events carry
   them too.
6. Route patterns: `/`, `/p/:precinct` (every precinct page, `/p/` and one segment, County `CC007`, City
   `W01P12`, any case, trailing slash, invalid codes), `/learn`, `/learn/<topic id>` for a
   known topic only, `/early-voting`, `/privacy`, `/not-found` for everything else. No query
   string or hash ever. Each route in `src/App.jsx` has a pattern (a test fails when a route
   is added without one).
7. `src/analytics/` is the only app code that names `gtag`, `dataLayer`, `googletagmanager`
   or `google-analytics` (a test enforces it).
8. `render.yaml` CSP: `script-src` adds `https://www.googletagmanager.com`; `connect-src`
   adds `https://www.googletagmanager.com` and `https://*.google-analytics.com`; `img-src`
   adds `https://*.google-analytics.com`. The comment and `src/test/render.test.js` follow.
9. Privacy notice is driven by the config, so it is true in both states: with the ID empty it
   says what it says today (no analytics); with the ID set it drops "no analytics", keeps
   "sets no cookies", and adds a section naming both Google hosts, what is sent (page type,
   and which topic) and what is not (address, location, precinct), the IP and rough location caveat, and
   the GPC skip. `PrivacyPage.test.jsx` checks both states, and that every CSP origin is
   named by the notice in its analytics-on form.
10. `src/test/no-storage.test.js` passes unchanged. The app still logs nothing and touches no
    storage.
11. README: Privacy statement and Privacy section say analytics is off until the ID is set
    and what it sends then; the GA property settings checklist and the manual check before
    each election are written down.
12. First-load JS stays under the 120 KB budget (the module is small) and `npm run test:perf`
    passes (GA never loads on localhost).
13. #183 gets a comment: the service worker must not intercept or cache Google's hosts.

## Files that change

- `src/config/site.js`: `gaMeasurementId = ''`.
- `src/analytics/index.js` (new, first load): `ANALYTICS_HOSTS`, `analyticsEnabled`,
  `analyticsAllowed`, `startAnalytics(win, id)`, `pageView(path)` (deduped, queued until GA
  loads).
- `src/analytics/ga.js` (new, its own chunk, loaded after `load` in idle time):
  `routePattern`, `PAGE_TITLES`, `pageTitleFor`, `LOADER_URL`, `startGa` (consent, config,
  the script tag, the page view sender).
- `src/analytics/index.test.js` (new): unit tests for both.
- `src/App.jsx`: an effect calling `pageView(location)`.
- `src/main.jsx`: `startAnalytics(window)` before render.
- `src/test/analyticsOnly.test.js` (new): only `src/analytics/` names Google or gtag.
- `src/test/analyticsPrivacy.test.jsx` (new, next to `addressPrivacy.test.jsx`): the real app,
  GA forced on with a fake `gtag`, a lookup by address and by Use my location to `/p/CC007`;
  every recorded call is free of the address, its parts, the coordinates and the code.
- `src/features/privacy/privacyCopy.js`, `src/i18n/en.json`, `PrivacyPage.test.jsx`, and
  `PrivacyPage.analytics.test.jsx` (new, the notice with an ID set via `vi.mock`), sharing
  `src/test/privacyNotice.js` (new: the CSP origins and the hosts a text names).
- `render.yaml`, `src/test/render.test.js`.
- `e2e/analytics.e2e.js` (new): builds the app with a test ID (a Vite plugin that rewrites
  `site.js` in the test's own build, no production hook), serves it with `vite preview` at the
  production origin through Playwright routing, stubs Google's hosts, runs a Use my location
  lookup to `/p/CC007` and opens a topic; checks every Google request and every `dataLayer`
  entry for the code, the coordinates and real paths, and that no cookie is set. A second case
  with GPC on sees no Google request; a third with the real build (ID empty) sees none.
- `README.md`.

## Order of work

1. Plan commit.
2. Analytics module, red tests first (route map, allowed, consent order, loader timing).
3. Hook and wiring in App and main, with the forced-on app test.
4. Only-module test.
5. CSP and render tests.
6. Privacy notice, both states.
7. e2e spec.
8. README; the #183 comment.

## Risks

- GA's automatic events (`user_engagement`, `session_start`) read the page's own URL unless
  `page_location` is set globally: handled by `gtag('set', ...)` before `config` and before
  each page view, never in `config` (gtag ranks config over set). Enhanced measurement must be turned off in GA (README checklist).
- `document.referrer` can hold another site's URL: `page_referrer` is forced empty.
- StrictMode double effects and the precinct redirect: `pageView` keeps the last path sent in
  the module and skips the same path again, a `/p/` path compared as the redirect
  canonicalizes it (letter case, spaces, trailing slash).
- The e2e cannot run the real `gtag.js` (no live services in CI), so it checks the loader
  request and the `dataLayer` gtag.js would read, not real `collect` hits. The manual check
  before each election covers the real hits.
- CSP: Google also documents `*.analytics.google.com` for some setups (Google signals). Not
  added: signals are off, and a blocked request leaks nothing.

## Proof

- Criteria 1 to 6: `src/analytics/index.test.js`, `src/test/analyticsPrivacy.test.jsx`.
- 7: `src/test/analyticsOnly.test.js`. 8: `src/test/render.test.js`.
- 9: `PrivacyPage.test.jsx`. 10: `no-storage.test.js` unchanged and green.
- 12: `src/test/build.test.js`, `npm run test:perf`.
- e2e: `e2e/analytics.e2e.js`. Live drive: the e2e run (a real browser at the production
  origin); `/privacy` in both states is covered by the two notice tests and the axe e2e run.

## Revisions

- Implementation: the first version put the whole module in the first load, +1.15 KB gzipped
  against about 1.8 KB of headroom under the 120 KB budget. GA itself moved to `ga.js`, a chunk
  loaded only when analytics may run, after `load` in idle time; page views before it loads
  are queued as paths in memory. The first load grew 0.72 KB, 0.31 KB of it the notice text.
- Review (finder 1): page fields moved from `config` to a `set` before it; the page view dedupe
  now compares the canonical form the precinct redirect uses (case, spaces, trailing slash).
