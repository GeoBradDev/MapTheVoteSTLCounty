# MapTheVoteSTLCounty

A nonpartisan voter guide for St. Louis County, Missouri, live at
[mapthevotestl.com](https://mapthevotestl.com). A voter types an address or uses their
location and gets their precinct, the nearest polling places, their sample ballot, their
districts and the in-person absentee voting sites and hours, plus short "How to vote" guides
built from official sources. A voter with a St. Louis City address is referred to the City's
own Board of Election Commissioners.

It is for St. Louis County voters, on a phone first, and for whoever runs it for the next
election: the sections below say how to set it up, where its data comes from and how to
point it at a new election.

Contents: [Nonpartisan statement](#nonpartisan-statement) ·
[Privacy statement](#privacy-statement) · [Disclaimer](#disclaimer) ·
[Development](#development) · [Data sources](#data-sources) ·
[Updating for a new election](#updating-for-a-new-election) · [Deploy](#deploy) ·
[Contributing](#contributing) · [License](#license)

## Nonpartisan statement

A nonpartisan, unofficial guide. Not affiliated with the St. Louis County Board of Elections
or the St. Louis City Board of Election Commissioners. (The site's footer opens with this
statement on every page: it is the start of `footer.statement` in `src/i18n/en.json`, which
then adds "For official information, visit:" before links to both boards. Keep the two the
same.)

- **Reference tool only.** It says where, when and how to vote. It makes no endorsements and
  no comment on any candidate, party or ballot measure, and it never ranks or orders
  candidates or measures.
- **Official sources only.** Voter information comes from the St. Louis County Board of
  Elections, the Missouri Secretary of State, Missouri statutes and other official sources.
  Ballots are the board's own sample ballot PDFs, linked as published, never retyped or
  summarized.
- **Neutral design.** No red or blue anywhere (see [Colors](#colors)).

## Privacy statement

The site has no accounts, no analytics, no cookies and no server of its own: the browser talks
straight to the public services that look up the address and the precinct. It never saves a
typed address or a device location, in the URL, browser storage, cookies or the browser's
cache, and a share link holds only the precinct code, like `/p/CC007`. The plain-language
notice at [`/privacy`](https://mapthevotestl.com/privacy) says what each service gets; the
[Privacy](#privacy) section below has the rules and the tests that hold the code to them.

## Disclaimer

This is not an official St. Louis County app. For official information, contact the
[St. Louis County Board of Elections](https://stlouiscountymo.gov/st-louis-county-government/board-of-elections/)
(314-615-1800). St. Louis City voters should contact the
[St. Louis City Board of Election Commissioners](https://www.stlouis-mo.gov/government/departments/board-election-commissioners/).

## Development

`.node-version` pins Node for CI and Render; use the same version locally.

```sh
npm install
npm run dev           # start the dev server
npm run build         # build the static site into dist/
npm run preview       # serve dist/ locally
npm test              # run the tests once (npm run test:watch to watch)
npm run test:e2e      # accessibility and failure-state checks in Chromium; run npm run build first
npm run test:perf     # Lighthouse performance budgets; run npm run build first
npm run lint          # ESLint, including jsx-a11y rules
npm run format        # format with Prettier (npm run format:check to check only)
```

CI runs lint, format check, tests, build, the accessibility checks and the performance
budgets on every pull request
and on push to `main`.

The scripts that talk to live services are run by hand (and some by the daily data health
workflow), never in CI:

```sh
node scripts/inspect-data.mjs         # dump the county layers' schemas and samples to docs/raw/
node scripts/record-fixtures.mjs      # re-record the live responses the tests use (docs/raw/fixtures/)
node scripts/check-config.mjs         # check the layers src/config/election.js names (Data health check)
node scripts/check-geocoder.mjs       # check address search end to end (Address search)
node scripts/check-content-links.mjs  # request every source and link (Learn content)
npm run smoke -- <url>                # check a deploy (Smoke test)
```

## Data sources

[`docs/data.md`](docs/data.md) is the full record: every layer and field, what each was checked
against, and why. In short:

- **Precincts, polling places and early voting sites:** the St. Louis County Board of
  Elections' public ArcGIS layers under
  [its service root](https://services6.arcgis.com/wkbq75VVf2MvUvs7/ArcGIS/rest/services), named
  per election (for November 3, 2026,
  [`precincts_2026_11_view`](https://services6.arcgis.com/wkbq75VVf2MvUvs7/ArcGIS/rest/services/precincts_2026_11_view/FeatureServer/1)
  and
  [`polls_2026_11_view`](https://services6.arcgis.com/wkbq75VVf2MvUvs7/ArcGIS/rest/services/polls_2026_11_view/FeatureServer/1)),
  plus
  the
  [county boundary layer](https://services6.arcgis.com/wkbq75VVf2MvUvs7/ArcGIS/rest/services/St_Louis_County_Boundary/FeatureServer/0).
  The polls layer holds both Election Day and in-person absentee sites; no layer assigns a
  polling place to a precinct, so the app lists the nearest and says how to confirm the
  assigned one.
- **Sample ballots:** each precinct's `html` field links its PDF on the board's
  [ArcGIS portal](https://stlouiscovotes.maps.arcgis.com). The app shows the link only when it
  matches the config's pattern and names the precinct.
- **Dates, hours and rules:** not in any layer. They come from the board's own Instant Apps,
  the [Missouri Secretary of State](https://www.sos.mo.gov) and the
  [Revised Statutes of Missouri](https://revisor.mo.gov), and live in `src/config/election.js`
  with their sources and the date each was last checked.
- **Address search:** St. Louis County's address points (the
  [live county layer](https://maps.stlouisco.com/hosting/rest/services/Maps/ASR_Address_Points/FeatureServer/0),
  then its
  [hosted copy](https://services2.arcgis.com/w657bnjzrjguNyOy/arcgis/rest/services/Address_Points/FeatureServer/2)),
  then [Photon](https://photon.komoot.io) (OpenStreetMap data), with a match that could get a
  county precinct checked against the City of St. Louis's own
  [geocoder](https://maps6.stlouis-mo.gov/arcgis/rest/services/GEOCODERS/COMPOSITE_GEOCODE/GeocodeServer).
  See [Address search](#address-search).
- **Map:** [OpenFreeMap](https://openfreemap.org)'s Positron basemap. See [Map](#map).
- **How to vote guides:** Markdown under `content/`, each citing official sources only. See
  [Learn content](#learn-content).
- **Referrals:** the City board and the Secretary of State's Voter Outreach Center, in
  `src/config/referrals.js`.

## Updating for a new election

The next election is mostly an edit to config and content; the scripts' own sample lists
may need new values too. Work on a branch and merge through the usual pull request.

1. **Find the new layers.** The board publishes a new view per election, named like
   `precincts_YYYY_MM_view` and `polls_YYYY_MM_view`. List the services at the service root
   (append `?f=json`), or open the board's current lookup Instant App on its ArcGIS portal and
   read which layers its web map uses. Do not use the `lookup_view_*` services: their names
   look current but they point at old data (`docs/data.md`).
2. **Inspect them.** Put the new service names in the `SERVICES` list at the top of
   `scripts/inspect-data.mjs` (and the new lookup app's id in `INSTANT_APP_ID` if it changed),
   then run `node scripts/inspect-data.mjs`. It writes each layer's fields, counts and sample
   rows to `docs/raw/`. Compare them with `docs/data.md`: the field names, the congressional
   district field and the sample ballot link format. The script saves only 3 sample rows per
   layer, so query the layer for the distinct `in_election` and `abs_type` values.
3. **Update `src/config/election.js`.** Every value that changes between elections is there,
   including every link to that election's own Instant Apps, each with its `sources` and
   `lastVerified` where it has them. Re-read every source; do not copy a value forward
   unchecked. If a field the app reads was renamed, search `src/` and `scripts/` for the old
   name and change every use, including `PRECINCT_FIELDS` and `POLL_FIELDS` in
   `src/data/arcgis.js` and the field lists in `scripts/check-config.mjs`. See
   [Election config](#election-config).
4. **Update `docs/data.md`** with what the inspection found, and why for anything that
   changed.
5. **Re-verify every content topic.** For each file under `content/*/learn/`, re-read every
   source, fix any text that changed, then set `election` to the new date and `lastVerified`
   to the day you checked. The build fails until every topic is updated, and it also fails on
   a `lastVerified` more than 60 days before Election Day, so do this step within that window.
   See [Learn content](#learn-content).
6. **Re-record the fixtures** with `node scripts/record-fixtures.mjs`, so the tests and the
   address search check below use the new layers. Pick new sample precincts in it if the old ones are gone.
7. **Run the health check** and fix what it reports:

   ```sh
   node scripts/check-config.mjs
   node scripts/check-geocoder.mjs
   node scripts/check-content-links.mjs
   ```

   `check-geocoder.mjs` looks up the polling places named in its `LOCS` list in the new
   fixtures, and expects its sample address in a named precinct: when either is gone, change
   the list at the top of the script. `check-config.mjs` has fixed points, one per County
   Council district, which change only when the districts are redrawn, and a sane range for
   the precinct count. Open any link the content check skipped in a browser. See
   [Data health check](#data-health-check) and [Address search](#address-search).
8. **Run the full gate** locally (`npm run lint`, `npm run format:check`, `npm test`,
   `npm run build`, `npm run test:e2e`, `npm run test:perf`). Tests that name a precinct,
   polling place or count from the old fixtures may need the new values.
9. **Deploy.** Merge the pull request; `main` deploys once CI passes. Run
   `npm run smoke -- https://mapthevotestl.com`, then the hand checks in
   [Accessibility](#accessibility), [Performance](#performance) and [Privacy](#privacy).
   The daily data health workflow reads the new `electionDate` without changes; confirm in
   the Actions tab that it is still turned on and that a run passes (**Data health**,
   **Run workflow**).

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

The target is WCAG 2.1 AA (#26). `npm run test:e2e` runs `e2e/a11y.e2e.js` (and the failure states of #18, `e2e/failures.e2e.js`) with Playwright
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

The polling places layer the app keeps in memory (`getPolls` and `getAbsenteeSites`) has a max
age (#84): `layerMaxAge` in the config, shorter on Election Day (the date in the config's time
zone). `isFresh` and `layerMaxAgeMs` in `src/data/freshness.js` are the one rule for "too old":
any later refreshed layer (wait times, City layers) uses them rather than its own expiry. The
polling places and early voting cards fetch again when the tab is shown after the max age, so a
tab left in the background for days shows a moved polling place when the voter returns to it
(not while the tab stays visible); a refresh that fails keeps the rows shown and says when they
were loaded. The service worker (#25) must not keep serving an answer older than this max age.

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
any `.gov` site (the county board's website is on the county's `.gov` site) and the board's
ArcGIS portal, listed in
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
`content/es/learn/voter-id.md`. A locale shows the English topic until its own exists. The
labels around a topic are in that locale's messages (see [Languages](#languages)).

`node scripts/check-content-links.mjs` requests every source and link in every topic, and every
page `src/config/election.js` links (each `sources` entry and each value whose key ends in `Url`
or `Source`), and prints PASS, FAIL or SKIP per URL. It fails a URL on an error status, on a
request that fails or times out after its retries (a request that timed out twice gets 75 s
on its last try instead of 15 s, for up to 3 URLs a run, because www.sos.mo.gov sometimes
stalls about a minute on a healthy page, #116), on a redirect that lands off the official
hosts, and on an HTML page whose
`<meta http-equiv="refresh">` sends the browser to a different page (#74). A `403` bot
challenge, which only a browser gets past, is a SKIP: it does not fail the run, and a person
must open the URL in a browser. Any other `403` fails. It exits 1 on any failure;
`--skipped <file>` writes the skipped URLs to a file. The data health workflow runs it daily
(see below), never on pull requests.

## Languages

Every word the app shows is in `src/i18n/en.json` and reaches the page through `t()`
(`src/i18n/index.js`), mostly by way of the copy module next to each feature, such as
`src/features/lookup/resultsCopy.js`. Messages fill in `{name}` values and pick plurals with
`{count, plural, one {...} other {...}}`. Values from the county's data, such as district
names, election values from `src/config/election.js`, and the names of the address search
services and their data (from the geocoder modules, as the privacy notice requires) are shown as
they are. So are the home page's tab title and its search and link-preview description, both
`index.html`'s, the map's credit line and MapLibre's own built-in text (its gesture hints and
the map's label). ESLint's `react/jsx-no-literals` fails on words typed straight into JSX.

To add a language, such as Spanish: copy `en.json` to `src/i18n/es.json`, translate the
values (keep the keys and the `{...}` names), and add its line to `LOCALES` in
`src/i18n/config.js`. A key it lacks falls back to English. The language switcher appears once
there are two languages; choosing one loads its file, sets `<html lang>` and redraws the page
in it, keeping focus and what the page has loaded. The site always starts in English. Dates are formatted for the language in the election's time zone,
`America/Chicago`.

## Data health check

Before each election, after editing `src/config/election.js`, check the live layers it names:

```sh
node scripts/check-config.mjs [--layer <key>=<path>] [--ballot-sample <n|all>]
```

It checks that each configured layer answers with the geometry and every field the app reads,
that the precinct count is in a sane range, that every `In Election` precinct's sample ballot
link parses and its file name names that precinct (and that 5 random links serve a PDF whose
`Content-Disposition` file name names the same precinct), that the absentee filter finds sites with
hours in the config, and that one known point per County Council district lands in a precinct
in that district and inside the county boundary layer, while a point in St. Louis City lands in
neither. It prints PASS, FAIL or SKIP per check and exits 1 on any failure; a wrong
layer path fails with the config key, the path and the service's error. `--layer` tries another
path for one layer without editing the config. `--ballot-sample` checks that many random sample
ballot links instead of 5, or every link with `all` (one request each to the county's portal, so
run it by hand, for example once before Election Day, not on the schedule). The thresholds and known points are at the top of
the script.

`.github/workflows/data-health.yml` runs this check, `scripts/check-geocoder.mjs` and
`scripts/check-content-links.mjs` every day at 12:00 UTC until Election Day is over in the
config's time zone, and on demand from the Actions tab (**Data health**, **Run workflow**). On
a failure it opens an issue labeled `data health`, or comments on the one already open; close
that issue once it is fixed. Links the content check skipped behind a bot challenge are listed
on every run's summary page and in that issue; open each in a browser before Election Day.
The workflow never runs on pull requests, so a live outage cannot block a merge. For the next election, nothing in the workflow changes: it reads the new `electionDate`. GitHub turns off
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
itself, #13); a failed page load moves focus to its message. A failed refresh of a list already
shown keeps its rows and says when they were loaded instead (#84).
After `SLOW_MS` (`src/features/lookup/slowNotice.js`), the lookup and the precinct page say
they are still working. When the browser reports no connection, the lookup's and the precinct
page's messages say the voter appears to be offline (cached polling places wait for the PWA, #25). A page that throws
while rendering shows a plain error screen (`src/components/ErrorBoundary.jsx`), and
`src/main.jsx` keeps React from logging caught errors. `e2e/failures.e2e.js` breaks each
service in turn (network refusal, a request that never answers, 5xx) in a real browser.

## Privacy

Addresses are sensitive. The app itself never puts a typed address or its coordinates in the
URL, `localStorage`, `sessionStorage`, IndexedDB, cookies, logs or analytics, and v1 has no
analytics. Every request that carries a typed address or coordinates uses `cache: 'no-store'`,
no cookies and no referrer, and sends them in a POST body, never the URL, where the service
accepts one (#38): the county's address layers, the City geocoder and the precinct and boundary
point queries. Photon has no POST endpoint, so it gets the typed text in a GET query string;
the notice says so. A new request that carries either must do the same, and a service worker
(#25) must not put those requests in Cache Storage, which `no-store` does not cover. The plain-language
notice at `/privacy` (`src/features/privacy/privacyCopy.js`, its text under `privacy` in
`src/i18n/en.json` and every other language's file) says what each third party gets;
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
address or the coordinates go only to the hosts the notice names, that the point queries are
POSTs with no coordinates in their URL, and that none of those requests comes back from the
HTTP cache.
Use my location turns away a fix with an accuracy radius over 100 m before any query (#83), so
for this check use a phone with precise location on, or an emulated location whose accuracy is
set to 100 m or less. If it says the location is only a rough estimate, press it again.

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

## Contributing

Open a pull request against `main`. Every pull request runs the CI gate above and needs it
green; run it locally first.

- **Voter information needs an official source.** Any fact a voter acts on (dates, hours,
  places, ID rules, deadlines, phone numbers) comes from an official source: the county
  board, the Missouri Secretary of State, Missouri statutes or another government site.
  Cite it next to the value (`sources` and `lastVerified` in `src/config/election.js`, or a
  topic's front matter under `content/`). The build rejects a topic link outside the official
  hosts (`src/features/learn/content/officialSources.js`). News sites, advocacy groups,
  campaigns and parties are not sources.
- **Stay nonpartisan.** Follow the [Nonpartisan statement](#nonpartisan-statement): no
  endorsements, candidate or measure commentary, or rankings, and no red or blue.
- **Election values go in config.** Anything that changes between elections goes in
  `src/config/election.js`, never in the code that reads it (see
  [Election config](#election-config)).
- **A change to what is sent to a service** also changes the privacy notice in the same pull
  request (see [Privacy](#privacy)).

## License

No license has been chosen yet (#118), so the code is not yet open for reuse. Until a
`LICENSE` file is added, ask the owner before reusing it. Voter information and sample ballots belong to
their official publishers.
