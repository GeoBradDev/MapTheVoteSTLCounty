# Plan: Privacy: no address storage or tracking, plus a short privacy notice (issue #20)

Risk tier: Medium. Low base, raised one for touching several files across routing, hosting
config, copy and tests. It adds rather than alters behavior, and the copy is checked by tests,
but a false privacy claim is costly, so round up. No auth, money, data writes or outward
messages. The orchestrator's run instructions stand in for the Medium plan approval
(autonomous batch run); noted in the PR.

Domain skills: vercel-react-best-practices: not applicable because the change is one static
page and a footer link with no effects or data fetching. chrome-devtools-mcp: invoke for the
live drive (storage, Cache Storage, IndexedDB, cookies and URL after a real lookup).
humanizer: invoke on the notice copy (plain language). frontend-design: not applicable
because the page reuses the existing text and link styles. Django, FastAPI, Expo, payments,
email: not applicable because the app is a frontend-only React site.

## What already exists

- The app has no analytics, cookies or storage calls under `src/` (grep: no `localStorage`,
  `sessionStorage`, `indexedDB`, `document.cookie` or `console.`).
- `sharePrivacy.test.jsx` (#17) proves the URL, history state, title and share link hold no
  address or coordinates after a lookup.
- `render.yaml` sends `Referrer-Policy: no-referrer` (#31).
- Photon gets typed text in a GET query string with `cache: 'no-store'`. ArcGIS point queries
  put `geometry=lng,lat` in a GET query string with default caching (#38, open, not fixed here).
- #49 (in progress, separate branch) adds St. Louis County's address points
  (`maps.stlouisco.com` and a hosted copy on `services2.arcgis.com`, POST with `no-store`) as
  the primary address search, with Photon as fallback. This change must not edit #49's files
  (`src/data/photon.js`, `src/data/geocoder.js`, the county provider, `GeocoderAttribution`,
  `lookupCopy.js`).

## Acceptance criteria

1. A privacy notice page at `/privacy`, in plain language, says what is sent where: the address
   search services get the typed text (St. Louis County's address service and, as a backup,
   Photon); the county's election maps on Esri's ArcGIS Online get coordinates or a precinct
   code; the basemap host gets tile requests for the area on screen; the web host sees the
   pages opened. It names each third party the browser calls by its host name, except the county
   address service's hosts, which #49 adds (see Revisions).
2. The notice says what the site never does: no address or location in the URL, browser
   storage or cookies; no analytics, ads or tracking; no server or account of its own.
3. The notice says nothing false while #38 is open: it says plainly that point queries carry
   the coordinates in the request's web address, where the service may log them, and that the
   browser may keep those answers in its ordinary cache.
4. Every page has a footer with a link to the notice.
5. `/privacy` has its own `no-cache` rule in `render.yaml`, checked by `render.test.js`.
6. Every origin in the Content-Security-Policy `connect-src` (other than `'self'`) is named in
   the notice, so a new third party cannot be added without updating it (test).
7. An automated test runs a lookup through the real app, then checks `localStorage`,
   `sessionStorage`, cookies, Cache Storage and IndexedDB (when the environment has them), the
   URL, the history state and the console for the test address and its coordinates.
8. A source scan test fails if any file under `src/` (tests excluded) uses `localStorage`,
   `sessionStorage`, `indexedDB`, `document.cookie` or `console.`.
9. A PR template asks "Does this change send, store, or log an address?".
10. README gets a short Privacy section: the rules, where the notice lives, and the manual
    browser check (the automated test cannot see a real browser's HTTP cache or devtools
    storage).

## Files that change

- `src/features/privacy/PrivacyPage.jsx` (new): the notice.
- `src/features/privacy/privacyCopy.js` (new): all its text, kept out of the markup for i18n
  (#19), like the other `*Copy.js` files. Host names for ArcGIS and the basemap come from
  `election.serviceRoot` and `basemap.js`. The backup geocoder's name, operator and link come
  from `geocoder.js`'s `attribution` (import only), because `geocoder.test.js` lets only the
  geocoder modules name a provider; it reads both main's shape and #49's
  (`attribution.fallback`). The county address service hosts are written in the copy.
  (Revised during implementation: the first draft imported `photon.js` and named Photon in the
  copy, which the provider-naming test rejects.)
- `src/features/privacy/PrivacyPage.test.jsx` (new): renders the notice, checks the named
  hosts against the CSP, and the never-store claims.
- `src/components/SiteFooter.jsx` (new) and `src/App.jsx`: footer after `<main>` with a link to
  `/privacy`; route `/privacy`.
- `src/App.test.jsx`: `/privacy` renders the notice; the footer link is on every page.
- `src/test/addressPrivacy.test.jsx` (new): criterion 7.
- `src/test/no-storage.test.js` (new): criterion 8.
- `render.yaml`: `/privacy` `no-cache` rule. `src/test/render.test.js`: `/privacy` in
  `SHELL_PATHS`.
- `.github/pull_request_template.md` (new): criterion 9.
- `README.md`: criterion 10.

## Order of work

1. Tests for the route, footer and render.yaml rule (red), then the page, footer, route and
   rule.
2. Notice copy and its tests (hosts vs CSP).
3. Storage scan test and lookup privacy test (these pass on current code: they guard the rule).
4. PR template, README.

## Risks

- A copy claim that is false today or after #49: mitigated by wording ("St. Louis County's
  address service and, as a backup, Photon") and by naming the county hosts that #49 adds.
  Until #49 merges the notice names two hosts the app does not yet call; that overstates
  recipients, never understates them.
- Rebase conflict with #49 in `render.yaml` and `README.md`: keep both sides.
- The footer changes every page's layout: keep it outside `<main>` so the `main` landmark
  tests still hold, and inside the same max-width column.

## Proof

- Criterion 1, 2, 3, 6: `PrivacyPage.test.jsx`.
- Criterion 4: `App.test.jsx` footer test on `/`, `/p/CC007`, `/learn`, `/privacy`, not-found.
- Criterion 5: `render.test.js`.
- Criterion 7: `addressPrivacy.test.jsx`. Criterion 8: `no-storage.test.js`.
- Live drive: in Chrome, look up an address, then read `localStorage`, `sessionStorage`,
  `document.cookie`, `caches.keys()`, `indexedDB.databases()` and the URL; open `/privacy`
  from the footer.

## Revisions

- Review round 1: #49's `geocoder.test.js` forbids `stlouisco.com` outside its provider
  modules, so the notice does not write the county address service's hosts; #49 must add them
  (from its own module) when it adds their `connect-src` origins, or `PrivacyPage.test.jsx`
  fails. The address search text no longer calls Photon only a backup: today it is the only
  geocoder, and after #49 it also checks some county matches. The "never saves" item no longer
  says the location is gone when the page closes, since the HTTP cache may keep point queries
  (#38); it points to that paragraph instead. The Cache Storage check reads cached request
  URLs, not only cache names, with a self-check that stubs `caches`.
