# MapTheVoteSTLCounty

## Development

`.node-version` pins Node for CI and Render; use the same version locally.

```sh
npm install
npm run dev           # start the dev server
npm run build         # build the static site into dist/
npm run preview       # serve dist/ locally
npm test              # run the tests once (npm run test:watch to watch)
npm run test:e2e      # accessibility checks in Chromium; run npm run build first
npm run test:perf     # Lighthouse performance budgets; run npm run build first
npm run lint          # ESLint, including jsx-a11y rules
npm run format        # format with Prettier (npm run format:check to check only)
```

CI runs lint, format check, tests, build, the accessibility checks and the performance
budgets on every pull request
and on push to `main`.

## Deploy

The site is a Render static site defined by the Blueprint in `render.yaml`: the build, the
publish directory, the custom domain (`mapthevotestl.com`), the SPA rewrite, the security
headers and the cache rules. `src/test/render.test.js` checks it.

- **Deploys:** a push to `main` deploys after CI passes (`autoDeployTrigger: checksPass`).
  A change only under `docs/` or to `README.md` does not build. Markdown under `content/`
  still builds, because the learn topics are built from it.
- **Previews:** every pull request gets its own preview URL. A Blueprint cannot set headers
  per preview, so previews send the production headers and no `X-Robots-Tag: noindex`.
- **Change config in `render.yaml`, not the Dashboard.** A Blueprint sync overwrites header
  and route rules that `render.yaml` defines and fully replaces `buildFilter`. Rules that
  exist only in the Dashboard are kept, so deleting a rule from `render.yaml` does not
  remove it from Render: delete it in the Dashboard too.
- **Content-Security-Policy:** it allows only the origins the app calls. Code that fetches a
  new origin (a geocoder, map tiles, fonts) must add it to the policy in `render.yaml` in the
  same change, or the browser blocks the request in production.
- **Cache-Control:** no two header rules may match the same path; Render does not document
  how they combine. The app shell sends `no-cache` and hashed `/assets/` files are
  `immutable`. A new route needs its own `no-cache` rule.
- **Rollback:** in the Render Dashboard, open the service's **Deploys** page, find an earlier
  successful deploy and click **Rollback**. This redeploys that build's files only: headers,
  redirects and rewrites are not rolled back, so a bad header change needs a fix in
  `render.yaml`. A Dashboard rollback also turns off automatic deploys; fix or revert the
  change on `main`, then turn them back on in the service's **Settings**.

One-time setup (owner): in the Render Dashboard choose **New > Blueprint**, connect this
repository and apply `render.yaml`. Then add the DNS records Render shows for
`mapthevotestl.com` and `www.mapthevotestl.com` at the domain registrar, and wait for
Render to verify the domain and issue certificates.

## Smoke test

After a deploy, check the live site or a PR preview:

```sh
npm run smoke -- https://<site-or-preview-url>
```

It checks that `/` and a hard load of `/p/CC007` return the app shell, that a hashed asset is
served as JavaScript, and that the expected security and cache headers are present. It exits 1
and lists what failed. Against a host that sets no headers, such as `npm run preview`, add
`--skip-headers`. The expected headers are a table at the top of `scripts/smoke.mjs`; change it
when the host's header config changes. `src/test/render.test.js` checks `render.yaml` against
that table, so change both together.

## Accessibility

The target is WCAG 2.1 AA (#26). `npm run test:e2e` runs `e2e/a11y.e2e.js` with Playwright
against the production build (`vite preview`), at 360 px and 1280 px. On each key route it
runs axe-core (WCAG 2.1 A and AA plus best practice, contrast included) and checks for
horizontal scroll (also with the WCAG text spacing override), one `h1`, the page language and
the skip link; it also checks focus after an in-app link and reduced motion. The county's
layers are answered from `docs/raw/fixtures/` and every other outside request is blocked, so
it needs no network. The first run needs `npx playwright install chromium`. Add a route there
when the app gets a new one. In jsdom, without layout, `src/test/a11yPages.test.jsx` runs axe on home, privacy and
the two not-found pages, and `src/features/learn/learnA11y.test.jsx` on `/learn` with fixture
topics.

Page rules the checks rely on: every page has one `h1`, set with `tabIndex={-1}` so the app
can focus it after an in-app link (`App.jsx`), and its own tab title (`usePageTitle` in
`src/components/`, or the page's own effect). A heading inside a section keeps the level below
that section's heading.

Before each election, check by hand what automation cannot: VoiceOver on iOS, TalkBack on
Android and NVDA on Windows through search, results, share and a topic page; 200% browser
zoom on a desktop; and Windows High Contrast (forced colors).

## Performance

The target is a mid-range phone on a weak signal (#27). `npm run test:perf` runs
`e2e/lighthouse.js`: Lighthouse's mobile emulation at 360 x 640 px on simulated slow 4G with a
4x CPU slowdown, three runs each of `/`, `/p/CC007` and `/learn` against the production build
(`vite preview`). It fails when a page's median performance score is under 90, its median LCP
is 2.5 s or more, or any run reports no LCP or ends without the page's own content (its
heading, and on the results page the municipality, districts, sample ballot link and each
polling place's name and ZIP). It writes the report of the run with the median score to
`lighthouse-reports/` (CI keeps it as the `lighthouse-reports` artifact). No live service is
called: Chromium resolves the county's ArcGIS host and the basemap host to a local HTTPS
server, and every other host except `localhost` to nothing. That server answers the layers
from `docs/raw/fixtures/` (shaped to the query's `outFields` and `geometryPrecision`, gzipped
like the county's service) and the basemap style with a blank style (`BLANK_STYLE` in
`e2e/fixtures.js`). It needs `openssl` for the local server's throwaway certificate, and
Playwright's Chromium (`npx playwright install chromium`).

`src/test/build.test.js` keeps the JavaScript the first load fetches under 120 KB gzipped and
fails on any web font: the app uses the system font stack. Rules the scores rely on:

- Load anything large or slow to start only when it is needed, as the map is (see Map).
- Give a loading placeholder at least the size of what replaces it, so the page does not jump.
- Start the requests a page needs together, not one after another: the results page asks for
  the polling places, the early voting sites and (without a looked-up point) the outline while
  the precinct loads.
- Ask ArcGIS only for the fields the app reads: `PRECINCT_FIELDS` and `POLL_FIELDS` in
  `src/data/arcgis.js`. A query that names a field the layer lacks fails, so
  `scripts/check-config.mjs` checks every one of them (a test fails if it does not).

Lighthouse in CI cannot stand in for a phone. Before each election, open a results page and a
topic on an older Android phone and an iPhone at their default zoom, on mobile data, and check
that the page shows the polling places quickly, nothing jumps while it loads, and nothing
scrolls sideways.

## Colors

The palette is nonpartisan: no red or blue. Define colors only as oklch `--color-*` tokens in
`src/index.css` and use them through Tailwind classes. The tests fail on red or blue in the
CSS under `src` or in the built CSS, and on any `data:` URI in the CSS under `src` (put icons in
SVG components that use `currentColor`). Only CSS is checked: a color written anywhere else
(`index.html`, JSX props or SVG attributes, JavaScript strings) is not, so use token classes
there instead of color values.

## Election config

Everything that changes between elections (layer paths, dates, hours, election-specific links)
lives in `src/config/election.js`, so the next election is an edit to that file. Do not write
those values anywhere else in `src/` or in `index.html`. A test fails when it finds the
election name, an election-specific URL, a date, a layer or service name, the field name, the
filter or the sample ballot pattern from the config there; it does not check hours, so read
those from the config too. Text under `content/` may repeat them.

## Learn content

Each voter education topic is one Markdown file, `content/<locale>/learn/<id>.md`, with front
matter:

```yaml
---
id: voter-id # must match the file name
title: What ID to bring
group: before-you-vote # where /learn lists it
election: 2026-11-03 # must be electionDate in src/config/election.js
lastVerified: 2026-10-20 # when every source was last re-read
sources:
  - id: sos-id
    label: Missouri Secretary of State, Voter ID
    url: https://www.sos.mo.gov/...
---
```

`group` is one of `before-you-vote`, `ways-to-vote`, `at-the-polls` or `get-help`
(`src/features/learn/groups.js`); `/learn` lists the topics under those headings, in that
order, by title within each.

Cite a source after the claim it supports with `[^sos-id]`; the page shows it as a numbered
link to that source, matching the numbered source list. The body allows paragraphs, `##` and
`###` headings (a `###` only after a `##`; text and bold only, no links or citations), `- `
and `1. ` lists (one level; number ordered items 1, 2, 3 with no blank lines between them),
`**bold**` and `[text](url)` links, and nothing else (no HTML, images, code, tables or
quotes).

A Vite plugin (`src/features/learn/content/vitePlugin.js`) checks every topic file when the
build, the tests or the dev server start (restart the dev server after adding a topic), and
turns each topic into plain data. The build fails, naming the file and each problem, when a
topic: has no sources; has no `group`, or one not in the list; has no `lastVerified`, or one
more than 60 days before Election Day or after it; was written for another `election`;
contains `TODO`; has an `id` that differs from its file name, or a front matter key it does
not know; cites a source it does not list; uses Markdown outside the list above; or links
anywhere but an `https` URL on an official host or a path on this site. The official hosts are
any `.gov` site and the county board's own sites, listed in
`src/features/learn/content/officialSources.js`; add a host there in a reviewed change, never
per topic.

For each new election, re-read every topic's sources, then update its `election` and
`lastVerified`; the build fails until you do. `src/features/learn/topics.js` loads the topics
(`getTopics`, `getTopic`) and `src/features/learn/TopicArticle.jsx` renders one.

The "How to vote" pages (#23) are `/learn`, the index, and `/learn/<id>`, one topic. With no
topics, `/learn` says the guides are not ready and links to the county board's site and the
address lookup. A topic page folds each `##` section with at least `LONG_SECTION_CHARS`
characters of text (in `TopicArticle.jsx`) into a `<details>` with its heading in the summary,
and opens the folded ones while printing. The polling places card links to the `voter-id` topic and
the early voting card to the `absentee` topic, each only once that topic exists
(`src/features/learn/cardTopics.js`); give those topics these ids, or change that file.
`src/features/learn/learnA11y.test.jsx` runs axe on the pages with fixture topics.

Translations (#19): put a topic with the same `id` under another locale, such as
`content/es/learn/voter-id.md`, and add that locale's labels to
`src/features/learn/learnCopy.js`. A locale shows the English topic until its own exists.

`node scripts/check-content-links.mjs` requests every source and link in every topic, prints
PASS or FAIL per URL and exits 1 on any failure, including a redirect that lands off the
official hosts. The data health workflow runs it daily (see
below), never on pull requests.

## Data health check

Before each election, after editing `src/config/election.js`, check the live layers it names:

```sh
node scripts/check-config.mjs [--layer <key>=<path>]
```

It checks that each configured layer answers with the geometry and every field the app reads,
that the precinct count is in a sane range, that every `In Election` precinct's sample ballot
link parses (and that 5 random links serve a PDF), that the absentee filter finds sites with
hours in the config, and that one known point per County Council district lands in a precinct
in that district and inside the county boundary layer, while a point in St. Louis City lands in
neither. It prints PASS, FAIL or SKIP per check and exits 1 on any failure; a wrong
layer path fails with the config key, the path and the service's error. `--layer` tries another
path for one layer without editing the config. The thresholds and known points are at the top of
the script.

`.github/workflows/data-health.yml` runs this check, `scripts/check-geocoder.mjs` and
`scripts/check-content-links.mjs` every day at 12:00 UTC until Election Day is over in the
config's time zone, and on demand from the Actions tab (**Data health**, **Run workflow**). On
a failure it opens an issue labeled `data health`, or comments on the one already open; close
that issue once it is fixed. The workflow never runs on pull requests, so a live outage cannot
block a merge. For the next election, nothing in the workflow changes: it reads the new `electionDate`. GitHub turns off
scheduled workflows in a public repository after 60 days with no activity; if the daily runs stop,
turn the workflow back on in the Actions tab.

## Address search

The address box searches St. Louis County's official address points first, from the
browser with no key and no server of ours: the county's live layer, then its hosted copy on
ArcGIS Online when the live one is unavailable. When the county has no match (a St. Louis
City address, for example) or neither layer answers, it falls back to the public
[Photon](https://photon.komoot.io) geocoder (OpenStreetMap data). Every answer that could get
a county precinct is then checked with the City of St. Louis's own geocoder, unless the text
holds a ZIP entirely outside the City: when the City has the same address in another ZIP, the
voter gets the City referral, when both list it in one ZIP the answer is no match, and when the City geocoder fails or is slow, the app says address search is not working,
never a county precinct (#58, #18). `src/data/geocoder.js` builds that chain, `src/data/countyAddress.js`,
`src/data/photon.js` and `src/data/cityAddress.js` implement the sources and
`src/data/addressMatch.js` holds the strict matching rules they share; a test fails if any
other app file names a provider. docs/data.md (Geocoding, County address points, City check)
explains every rule.
To point a build at another Photon instance, set `VITE_GEOCODER_URL` (for example
`VITE_GEOCODER_URL=https://photon.example.org npm run build`). The Content-Security-Policy in
`render.yaml` allows only the default Photon origin, `https://photon.komoot.io`, the two
county origins and the City geocoder's origin in `connect-src`; add any other origin there too.

Check address search against the live services and the live precinct layer before each
election:

```sh
node scripts/check-geocoder.mjs [photon-base-url]
```

It geocodes 10 polling place addresses and 1318 Ross Ave with each source alone, with the
app's chain and with the chain while the live county layer is blocked, and checks that City
Hall and the City addresses of #58, whose number and street the county also has, get the City
referral, typed and picked from the suggestions, and that addresses the county and the City
both list in one ZIP (6135 Horton Pl 63133, 1 Brookings Dr 63130) are no match. It exits 1 if
the chain puts any address in the wrong precinct, a City address loses its referral, or a
shared address is not no match. "No match" is
allowed: the app then points the voter to "Use my location" and the county's official
lookup. Results are recorded in `docs/data.md` under Geocoding.

## Errors

When a service is slow or down, the app says so and offers a way forward (#18); it never
guesses a precinct. "We could not find that address" means the sources that answered had
no single answer: none has the address, two addresses or two precincts fit, the county and
the City both list it in one ZIP, or the only fit is not exact. A lookup that could not finish says address search is not working instead: every
source down, the City check or the county's precinct check failing or slow, Photon down after a county no
match, or no county layer answering with Photon finding nothing. (With the live county
layer down, the 2023 hosted copy's no match counts as an answer.)
Every source down was already a `GeocoderUnavailableError`; `createGeocoder` reports the
other cases that way only when the caller passes `reportUnavailable`, which the app does;
without it the chain answers no match for them, as the #49 and #58 tests and
`scripts/check-geocoder.mjs` expect. Every lookup error links the
county's official lookup next to Use my location, and every one but a no match has a Try
again button that repeats the same search, or the same device location without asking the
device again, until the voter edits the address. The precinct page and its polling places
and early voting cards show their own failures, each with Try again (the map still removes
itself, #13); a failed page load moves focus to its message.
After `SLOW_MS` (`src/features/lookup/slowNotice.js`), the lookup and the precinct page say
they are still working. When the browser reports no connection, the lookup's and the precinct
page's messages say the voter appears to be offline (cached polling places wait for the PWA, #25). A page that throws
while rendering shows a plain error screen (`src/components/ErrorBoundary.jsx`), and
`src/main.jsx` keeps React from logging caught errors. `e2e/failures.e2e.js` breaks each
service in turn (network refusal, a request that never answers, 5xx) in a real browser.

## Privacy

Addresses are sensitive. The app itself never puts a typed address or its coordinates in the
URL, `localStorage`, `sessionStorage`, IndexedDB, cookies, logs or analytics, and v1 has no
analytics. The browser's ordinary HTTP cache may still keep the precinct point queries, whose
URLs hold the coordinates, until #38 changes them; the notice says so. The plain-language
notice at `/privacy` (`src/features/privacy/privacyCopy.js`) says what each third party gets;
change it in the same change as any new service or any change to what is sent. `src/test/no-storage.test.js` fails
when app code under `src` uses browser storage, cookies or the console, and
`src/test/addressPrivacy.test.jsx` runs a lookup and checks storage, cookies, Cache Storage
entries, IndexedDB database names, the URL and the console for the address (jsdom has no
Cache Storage or IndexedDB, so those two run only where they exist). A test also fails when the
Content-Security-Policy allows an origin the notice does not name.

The tests run in jsdom, so check a real browser by hand before each election: look up an
address and use Use my location, then in the browser's devtools confirm that Application shows
no Local Storage, Session Storage, IndexedDB, Cookies or Cache Storage entries for the site and
that the URL is `/p/<code>` only. In the Network panel, confirm that the requests carrying the
address or the coordinates go only to the hosts the notice names, and whether the point queries
come back from the HTTP cache; if #38 has changed that, update the notice.

## Share links

A precinct's results live at `/p/<code>`, like `/p/CC007`. The URL, the page title and the
"Share this page" link hold only the precinct code: never the address, its text or its
coordinates. A code in the wrong letter case, like `/p/cc007`, is replaced with the upper case
URL. Shared links always use the production origin from `src/config/site.js`, so a link copied
from a PR preview or a local build still works after that build is gone.

## Map

The results screen shows a small map of the precinct and the listed polling places (#13). It
is extra help: the list holds everything on it, its markers are hidden from screen readers,
and it is removed when anything fails before it first renders, when it takes longer than 15
seconds of visible time, or when the browser lacks WebGL 2. It comes after the list and loads
only once it scrolls into view (#27), since MapLibre is a large download and slow to start on
a phone; the 15 seconds count from then. MapLibre GL JS is loaded with `import()` only then
(`src/features/lookup/precinctMapView.js` is the only file that imports it), and its worker
ships as a same-origin file, so the Content-Security-Policy needs no `blob:` source. The app
ships its own few MapLibre layout rules (`src/features/lookup/precinctMap.css`) instead of
`maplibre-gl.css`, which embeds `data:` icons and party blue.

The basemap is [OpenFreeMap](https://openfreemap.org)'s Positron style: free, with no API key
or account, and its terms allow embedding it. Its attribution (OpenFreeMap, OpenMapTiles,
OpenStreetMap contributors) is shown as links under the map. Its water labels are blue and
its interstate shields slate blue, so the map draws every label in the muted token and
interstates with the gray road shield. Tile requests tell OpenFreeMap (and
Cloudflare, its CDN) which area is on screen: the precinct and its nearest polling places,
which depend a little on the searched point within the precinct. The `no-referrer` policy
keeps the page URL out of them. `src/features/lookup/basemap.js` holds the style URL and the
credits; to change the basemap, change that file and the origin in `render.yaml`'s
`connect-src` together, and check the new style's colors and sprite icons for red or blue.
