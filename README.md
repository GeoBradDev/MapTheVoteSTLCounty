# MapTheVoteSTLCounty

St. Louis Voter Guide is a nonpartisan guide for voters in St. Louis City and St. Louis County,
Missouri, live at
[mapthevotestl.com](https://mapthevotestl.com). A voter types an address or uses their
location and gets their precinct, the nearest polling places, their sample ballot, their
districts and the in-person absentee voting sites and hours, plus short "How to vote" guides
built from official sources. A voter with a St. Louis City address is sent to their City precinct's
page (#88), with its nearest City polling places, the City Board's Election Day rule and the
map (#89), the City's early voting sites and hours (#91), its districts (#90) and the City
Board's one sample ballot for all precincts (#92); when the precinct cannot be found, they are referred to the City's own Board of
Election Commissioners.

It is for St. Louis City and County voters, on a phone first, and for whoever runs it for the next
election: the sections below say how to set it up, where its data comes from and how to
point it at a new election.

Contents: [Nonpartisan statement](#nonpartisan-statement) ·
[Privacy statement](#privacy-statement) · [Disclaimer](#disclaimer) ·
[Development](#development) · [Data sources](#data-sources) ·
[Updating for a new election](#updating-for-a-new-election) · [Deploy](#deploy) ·
[Search engines](#search-engines) · [Contributing](#contributing) · [License](#license)

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
  Elections, the St. Louis City Board of Election Commissioners, the Missouri Secretary of
  State, Missouri statutes and other official sources. Ballots are the board's own sample
  ballot PDFs, linked as published, never retyped or summarized.
- **Neutral design.** No red or blue anywhere (see [Colors](#colors)).

## Privacy statement

The site has no accounts, no cookies and no server of its own, and, until its Google Analytics
measurement ID is set, no analytics (see [Google Analytics](#google-analytics)): the browser talks
straight to the public services that look up the address and the precinct, and to the boards'
line count layers on the home page's line count map, the wait times page and the results page
while early voting runs or, on Election Day, while the polls are open (then a precinct's results
ask only its own board's; the home page's map asks only while a site is open, #184). It
never saves a
typed address or a device location, in the URL, browser storage, cookies or the browser's
cache, and a share link holds only the precinct code, like `/p/CC007`. Once the ID is set,
Google Analytics counts page views by page type, and which topic (every precinct page is `/p/:precinct`),
and a few voter actions by fixed labels (a lookup's outcome, and presses of the sample ballot,
directions, official lookup, Share and Try again), never what was searched or the address or location; it
sets no cookies and is skipped with Global Privacy Control. The plain-language
notice at [`/privacy`](https://mapthevotestl.com/privacy) says what each service gets; the
[Privacy](#privacy) section below has the rules and the tests that hold the code to them.

## Disclaimer

This is not an official St. Louis County or St. Louis City app. For official information, contact the
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
npm run test:e2e      # accessibility, failure-state and analytics checks in Chromium; run npm run build first
npm run test:perf     # Lighthouse performance budgets and SEO audits; run npm run build first
npm run lint          # ESLint, including jsx-a11y rules
npm run format        # format with Prettier (npm run format:check to check only)
```

CI runs lint, format check, tests, build, the accessibility checks and the performance
budgets on every pull request
and on push to `main`.

The scripts that talk to live services are run by hand (and some by the daily data health
workflow), never in CI:

```sh
node scripts/inspect-data.mjs         # dump the County and City layers' schemas and samples to docs/raw/
node scripts/record-fixtures.mjs      # re-record the live responses the tests use (docs/raw/fixtures/)
node scripts/check-config.mjs         # check the layers src/config/election.js names (Data health check)
node scripts/check-geocoder.mjs       # check address search end to end (Address search)
node scripts/check-content-links.mjs  # request every source and link (Learn content)
node scripts/build-outline.mjs        # rebuild the home dot map's County and City outlines (Map)
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
  polling place to a precinct, so the app lists the nearest: a registered County voter may vote
  at any County polling place on Election Day (#152), as the board's Polling Places page says.
- **Polling place rooms:** the room each County place and early voting site votes in, like
  "Gym Lobby", from the board's polling place dashboard view (its `ACTIVE_ROOM` field only),
  labeled as St. Louis County Board of Elections data (owner decision on #100). See
  `docs/data.md`, Polling place rooms.
- **St. Louis City:** the City Board of Election Commissioners' layers in the City's ArcGIS org
  (the one its polling places page's map comes from): precincts, districts (names and numbers only),
  the 56 Election Day sites and 8 early voting sites, and the City outline. See the St. Louis
  City section of `docs/data.md`.
- **Sample ballots:** each precinct's `html` field links its PDF on the board's
  [ArcGIS portal](https://stlouiscovotes.maps.arcgis.com). The app shows the link only when it
  matches the config's pattern and names the precinct. St. Louis City publishes one sample
  ballot PDF for all precincts on its Board's site (`sampleBallot` in `src/config/cityResults.js`,
  #92), which a City precinct's card links as that, never as the precinct's own ballot.
- **Dates, hours and rules:** not in any layer. They come from the board's own Instant Apps,
  the County Board's Polling Places page (the County's Election Day rule),
  the City Board's polling places page (the City's Election Day rule, quoted),
  the [Missouri Secretary of State](https://www.sos.mo.gov) and the
  [Revised Statutes of Missouri](https://revisor.mo.gov), and live in `src/config/election.js`
  with their sources and the date each was last checked.
- **Address search:** St. Louis County's address points (the
  [live county layer](https://maps.stlouisco.com/hosting/rest/services/Maps/ASR_Address_Points/FeatureServer/0),
  then its
  [hosted copy](https://services2.arcgis.com/w657bnjzrjguNyOy/arcgis/rest/services/Address_Points/FeatureServer/2)),
  then [Photon](https://photon.komoot.io) (OpenStreetMap data); the City of St. Louis's own
  geocoder finds City addresses after a county no match, and a match that could get a
  county precinct is checked against that
  [geocoder](https://maps6.stlouis-mo.gov/arcgis/rest/services/GEOCODERS/COMPOSITE_GEOCODE/GeocodeServer).
  See [Address search](#address-search).
- **Map:** [OpenFreeMap](https://openfreemap.org)'s Positron basemap, or its Dark one in dark
  mode. See [Map](#map).
- **How to vote guides:** Markdown under `content/`, each citing official sources only. See
  [Learn content](#learn-content).
- **Referrals:** the City board, its polling places lookup and the Secretary of State's Voter
  Outreach Center, in `src/config/referrals.js`.

## Updating for a new election

The next election is mostly an edit to config and content; the scripts' own sample lists
may need new values too. Work on a branch and merge through the usual pull request.

1. **Find the new layers.** The board publishes a new view per election, named like
   `precincts_YYYY_MM_view` and `polls_YYYY_MM_view`. List the services at the service root
   (append `?f=json`), or open the board's current lookup Instant App on its ArcGIS portal and
   read which layers its web map uses. Do not use the `lookup_view_*` services: their names
   look current but they point at old data (`docs/data.md`). The polling place rooms come
   from the election's polling places dashboard view, named like
   `November_3_2026_Polling_Places_Dashboard_view` (`layers.pollRooms`).
2. **Inspect them.** Put the new service names in the `SERVICES` list at the top of
   `scripts/inspect-data.mjs` (and the new lookup app's id in `INSTANT_APP_ID` if it changed),
   then run `node scripts/inspect-data.mjs`. It writes each layer's fields, counts and sample
   rows to `docs/raw/`, and the City Board's layers that `src/config/election.js` names to
   `docs/raw/city_*.json` (put new City layer paths in the config first; their samples hold
   only the fields the app reads, never `*`, as those layers also hold officeholder and staff
   contact details). Compare them with `docs/data.md`: the field names, the congressional
   district field (which map is in effect for the election: check the Revisor's note on
   RSMo 128.346 and a few sample ballots, see `docs/data.md`, then set `congressionalField`
   and `congressionalMap`) and the sample ballot link format. The script saves only 3 sample
   rows per layer, so query the layer for the distinct `in_election` and `abs_type` values.
3. **Update `src/config/election.js` and `src/config/cityResults.js`.** Every value that
   changes between elections is in one of them (the second holds what only the City's results
   cards read, see [Election config](#election-config)), including every link to that
   election's own Instant Apps, each with its `sources` and `lastVerified` where it has them.
   Re-read every source; do not copy a value forward unchecked. That includes the County's
   Election Day rule (`electionDayPollingPlace`), from the County Board's Polling Places page,
   which scripts cannot read: open it in a browser. It also includes the City Board's
   Election Day rule (`electionDayRule` in `cityResults.js`), quoted from its polling places
   page (its URL is in `src/config/referrals.js`, named by the rule's `source`): re-quote it
   from the page and set its `lastVerified` (a test fails while the quote names another
   election's date). It also includes the City's early voting dates and hours
   (`earlyVoting` in `cityResults.js`), from the same page's No Excuse Absentee hours and the
   City Board's No Excuse Absentee page, one schedule per site keyed by the voting locations
   layer's site id: the health check fails while a City early voting site has none. Its
   `sources` also name the City Board's Apply to Vote Absentee page, which the City card links
   for voting by mail. And it includes the City districts card's rows (`districts` in
   `cityResults.js`, #90): check each row's `electedoffice` names against the districts layer,
   and recheck which congressional map is in effect and that the whole City is still in one
   district under it (its `sources`). And it includes the City's sample ballot
   (`sampleBallot` in `cityResults.js`, #92): the City Board's one PDF for all precincts, linked
   from its Elections page (its `sources`). Open the new PDF and confirm it is the new
   election's ballot before setting `url` and `lastVerified`. If a field the app reads was renamed, search `src/` and `scripts/` for
   the old name and change every use, including `PRECINCT_FIELDS` and `POLL_FIELDS` in
   `src/data/arcgis.js` and the field lists in `scripts/check-config.mjs`. See
   [Election config](#election-config).
4. **Update `docs/data.md`** with what the inspection found, and why for anything that
   changed.
5. **Re-verify every content topic.** For each file under `content/*/learn/`, re-read every
   source, fix any text that changed, then set `election` to the new date and `lastVerified`
   to the day you checked. The build fails until every topic is updated, and it also fails on
   a `lastVerified` more than 60 days before Election Day, so do this step within that window.
   See [Learn content](#learn-content).
6. **Re-record the fixtures** with `node scripts/record-fixtures.mjs` (or
   `node scripts/record-fixtures.mjs city-` for the City layer and City geocoder fixtures alone), so the tests and the
   address search check below use the new layers. Pick new sample precincts in it if the old ones are gone.
   That script skips the early voting wait fixtures (`county-waits-*.json`,
   `city-waits-*.json`): a useful fresh fixture needs reports made during open hours, so once
   early voting opens, record them by hand with the queries in `docs/data.md` (Wait times) and
   update the recording day, hours and site usernames pinned in `src/data/waitFixtures.test.js`.
   Until then the old ones keep passing.
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

- **Files and the rewrites:** the build pre-renders the public pages (see
  [Search engines](#search-engines)): `dist/index.html` is the home page, and `learn/`,
  `learn/<id>/` and `privacy/` each hold an `index.html`. `dist/shell.html` is the empty
  client-rendered app shell. Render never rewrites a path where a file exists, but it serves
  a directory's `index.html` only for the path with a trailing slash (`/learn/`, not
  `/learn`), so `render.yaml` rewrites each pre-rendered page's path to its file, one rule per
  page, and then every other path, precinct pages included, to `/shell.html`. A new topic needs
  its own rule; `src/test/render.test.js` fails until it has one. `npm run preview` answers
  paths the same way (`src/prerender/plugin.js`).
- **Route changes show only on production.** A PR preview keeps the service's existing
  route rules, so a change to `routes` in `render.yaml` cannot be checked before merge. Merge
  it outside election weeks, then run `npm run smoke -- https://mapthevotestl.com` once the
  deploy finishes. If a check fails, revert the merge commit on `main` and also delete, in the
  Dashboard, any rule the revert took out of `render.yaml` (a sync keeps Dashboard rules, and
  a page rule left behind points at a file the older build lacks). The same goes for a topic
  that is removed or renamed: delete its old rule in the Dashboard too.

- **Deploys:** a push to `main` deploys after CI passes (`autoDeployTrigger: checksPass`).
  A change only under `docs/` or to `README.md` does not build. Markdown under `content/`
  still builds, because the learn topics are built from it.
- **Previews:** every pull request gets its own preview URL. A Blueprint cannot set headers
  per preview, but Render itself adds `X-Robots-Tag: noindex` to every preview (its docs say
  so, and PR #126's preview sent it), and the build also keeps crawlers out of them (see
  [Search engines](#search-engines)).
- **Change config in `render.yaml`, not the Dashboard.** A Blueprint sync overwrites header
  and route rules that `render.yaml` defines and fully replaces `buildFilter`. Rules that
  exist only in the Dashboard are kept, so deleting a rule from `render.yaml` does not
  remove it from Render: delete it in the Dashboard too.
- **Content-Security-Policy:** it allows only the origins the app calls. Code that fetches a
  new origin (a geocoder, map tiles, fonts) must add it to the policy in `render.yaml` in the
  same change, or the browser blocks the request in production.
- **`noindex` on precinct pages (#98):** `/p/*` is also served with `X-Robots-Tag: noindex`
  (see [Search engines](#search-engines)); `npm run preview` sends it too. Like any header
  change it shows only on production: check it with `curl -I https://mapthevotestl.com/p/CC007`
  or the smoke test after the deploy.
- **Preconnect on precinct pages:** `/p/*` is served with a `Link` header that preconnects to
  the ArcGIS host the page asks for its precinct first (`PRECINCT_PRECONNECT` in
  `src/prerender/plugin.js`, built from the County's and the City's election service roots).
  It names only hosts already in `connect-src` and in the privacy notice; `npm run preview`
  sends the same header. Like a route change, a header change shows only on production: check
  it with `curl -I https://mapthevotestl.com/p/CC007` after the deploy. Lighthouse's simulated
  network does not credit a preconnect, so the Lighthouse run cannot measure its gain.
- **Cache-Control:** no two header rules may match the same path; Render does not document
  how they combine. The app shell and the pre-rendered pages send `no-cache` and hashed `/assets/` files are
  `immutable`; `/robots.txt`, `/sitemap.xml` and the link preview image `/share-image.png` are
  cached for an hour; `/manifest.webmanifest`
  and `/sw.js` send `no-cache`. A new route needs its own `no-cache` rule.
- **Installable app, no service worker (#25):** every page links `/apple-touch-icon.png`, and
  the app's script links `/manifest.webmanifest` (`public/`, with its icons in `public/icons/`)
  10 to 12 seconds after the page has loaded (`src/linkManifest.js`: 10 s, then the next idle
  moment, at most 2 s more), so Chrome, Edge and Android can
  install the site and iOS Add to Home Screen gets the site's icon. Not in the HTML: a manifest
  link there is fetched at once, with an icon after it, beside the page's script and data, and
  cost the Lighthouse runs about 150 ms of LCP. `e2e/install.e2e.js` runs Chromium's own
  installability check on the build. The site registers no service worker and works offline no
  better than before; offline support is #183, deferred past the November 2026 election because
  a worker that served old hours, polling places or wait times on Election Day would be worse
  than none. A build test fails if a `sw.js`, or any mention of `serviceWorker` in the built HTML
  or scripts, appears before #183 replaces it with that worker's own tests. With no worker,
  there is nothing to unregister; #183 adds the kill switch (a self-destroying `/sw.js`, which
  `no-cache` lets a revert ship in one deploy) before its worker. Before each election, check
  Add to Home Screen on a real iPhone (the icon, the name and that it opens the home page; wait
  15 seconds after the page loads, before then iOS may have no manifest and saves the page itself)
  and install on an Android phone in Chrome.
- **Rollback:** in the Render Dashboard, open the service's **Deploys** page, find an earlier
  successful deploy and click **Rollback**. This redeploys that build's files only: headers,
  redirects and rewrites are not rolled back, so a bad header change needs a fix in
  `render.yaml`. A build from before the pre-rendered pages (#99) has no `shell.html`, so
  rolling back to one leaves deep links without a page until the rewrite in `render.yaml`
  points at `/index.html` again. A Dashboard rollback also turns off automatic deploys; fix or revert the
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

It checks that `/` returns the home page and a hard load of `/p/CC007` and of the City
precinct `/p/W01P12` the app shell (with nothing pre-rendered in it), that a hashed asset is served as JavaScript, that a hard load of `/`,
`/learn` and `/learn/voter-id` returns the page pre-rendered, with its `h1` and canonical, that `/robots.txt` is a text file with a `Sitemap:` line and
`/sitemap.xml` is XML (not the app shell), that `/manifest.webmanifest` is the web app manifest's
JSON (not the app shell), and that the expected security and cache headers are
present, `X-Robots-Tag: noindex` on `/p/CC007` among them (#98), and that the
Content-Security-Policy names Google Analytics' hosts exactly when the checkout's measurement ID
is set (#191). It exits 1 and lists what failed. Against a host that sets no headers, such as
`npm run preview`, add `--skip-headers`. Against a PR preview, add `--preview`: it then checks
that `/robots.txt` says `Disallow: /` and the home page and the shell carry `noindex`, instead of the sitemap. The expected headers are a table at the top of `scripts/smoke.mjs`; change it
when the host's header config changes. `src/test/render.test.js` checks `render.yaml` against
that table, so change both together.

## Search engines

Every build writes `robots.txt`, and a production build writes `sitemap.xml`, both from
`src/features/learn/content/searchEngines.js` (a Vite plugin), so neither file is kept by hand.

- **Indexed:** the home page, `/learn`, each topic at `/learn/<id>` and `/privacy`. These are
  the sitemap's entries, as absolute `https://mapthevotestl.com` URLs from `siteUrl` in
  `src/config/site.js`. The topics come from the topic files under `content/en/learn/`, so a
  new topic is listed on the next build. A topic's `<lastmod>` is its `lastVerified` date; the
  other pages have none.
- **Not in the sitemap:** precinct pages (`/p/<code>`). `robots.txt` does not disallow them:
  a disallowed URL can still be indexed from links, without its content, and a crawler cannot
  see a `noindex` on a page it may not fetch. The early
  voting wait times page (`/early-voting`, #104) is not in the sitemap or pre-rendered either:
  its content is live, so it is rendered in the browser from the shell. It is not `noindex`.
- **`noindex` (#98):** precinct pages, County and City alike (owner decision: their polling
  places are right only for the current election, and a search snippet can outlive a change),
  the not-found page and the error screen carry `<meta name="robots" content="noindex">` while
  shown (`useNoindex` in `src/components/`, which removes only the tag it added, never a PR
  preview's). The host answers every unknown path with 200 and the shell, so without it a
  mistyped link is a soft 404 that could be indexed. Precinct pages are also sent
  `X-Robots-Tag: noindex` (see Deploy), for crawlers that do not run the app; it is a header,
  not a tag in `shell.html`, because the wait times page gets the same shell. Link previews
  ignore both.
- **Pre-rendered pages:** the indexed pages above are static HTML too, so crawlers and link preview
  bots that do not run JavaScript get each page's content and its own title, description,
  canonical (`siteUrl` plus the path) and Open Graph tags (`og:type`, `og:site_name`,
  `og:title`, `og:description`, `og:url`, and the share image below). After the client build, `src/prerender/plugin.js`
  renders `src/entry-server.jsx` in Node for each path `prerenderPaths()` in `src/pageHead.js`
  lists (the sitemap's own list, `publicPaths()` in `src/config/publicPages.js`), and the browser hydrates the markup (`src/main.jsx`). The head values come from
  `pageHead()`, which the app also applies on every in-app navigation. A description is the
  page's own text, never new wording: `site.description` in `src/i18n/en.json` for the home
  page, as written (a test keeps `index.html`'s the same), and the intro of `/learn` and
  `/privacy` and a topic's first paragraph, each cut to 155 characters. A topic's paragraph
  counts only when it comes before the topic's first heading (one under a heading describes
  that section, not the page); a topic without one gets the `/learn` intro. Code that runs at module load or while
  rendering must work without `window`, `document` or `navigator`; `npm test` renders every
  pre-rendered path in Node. Precinct pages are never pre-rendered (their data is live) and
  keep the shell's head.
- **Link previews (#98):** every page, the shell included, names one site-wide share image,
  `public/share-image.png` (1200 x 630: the site's mark, its name and "Find where to vote" on
  the brand teal; no election or date, so it does not go stale), by its absolute production URL
  in `og:image`, with its size and alt text, and `twitter:card` `summary_large_image`.
  `scripts/draw-share-image.mjs` draws it from the palette tokens, `en.json` and the favicon's
  mark; run it again when any of those changes. The shell (`index.html`) writes out the
  site's own preview tags, `headTags(shellHead())` in `src/pageHead.js` (a test keeps the two
  the same), with no canonical or `og:url` since it answers many paths, so a shared precinct
  link previews with the site name, the description and the image. Each pre-rendered page
  replaces them with its own (`src/prerender/html.js`).
- **PR previews:** Render sets `IS_PULL_REQUEST=true` in a preview build. The build then
  writes a `robots.txt` of `User-agent: *` / `Disallow: /`, adds
  `<meta name="robots" content="noindex">` to `index.html` (and so to the shell and every
  pre-rendered page, which are built from it) and writes no sitemap. A local
  build and CI build as production.
- **The `onrender.com` copy:** the service also answers at its default `onrender.com`
  address. Render can turn that address off once a service has a custom domain (it then
  answers 404): the **Render Subdomain** toggle under **Custom Domains** in the service's
  Settings, or `renderSubdomainPolicy: disabled` in the Blueprint. Render does not offer a
  redirect, and its docs do not say whether turning it off affects PR previews, whose only
  address is an `onrender.com` one, so `render.yaml` leaves it on for now. To turn it off, add
  `renderSubdomainPolicy: disabled` to the service in `render.yaml` (not the Dashboard), then
  check that the next PR preview still loads; if it does not, take the line out again.
- **Search Console and Bing (owner):** verify `mapthevotestl.com` with a DNS TXT record, not a
  file or a meta tag in this repo. In [Google Search Console](https://search.google.com/search-console),
  add a **Domain** property for `mapthevotestl.com`, add the TXT record it shows at the
  domain registrar, then click **Verify**. In
  [Bing Webmaster Tools](https://www.bing.com/webmasters), import the site from Search Console
  or add it and verify it the same way with Bing's TXT record. In each, submit
  `https://mapthevotestl.com/sitemap.xml` (Search Console: **Sitemaps**; Bing: **Sitemaps**,
  **Submit sitemap**) and check that it is read without errors.

## Accessibility

The target is WCAG 2.1 AA (#26). `npm run test:e2e` runs `e2e/a11y.e2e.js` (and the failure states of #18, `e2e/failures.e2e.js`) with Playwright
against the production build (`vite preview`), at 360 px and 1280 px. On each key route it
runs axe-core (WCAG 2.1 A and AA plus best practice, contrast included) and checks for
horizontal scroll (also with the WCAG text spacing override), one `h1`, the page language,
the skip link, the site header in one row at most 56 px tall (#79), and touch targets: every link drawn as a box of its own (not `display: inline`)
and every other control (button, summary, form control, or a link alone in its block) is at
least 44 px tall. A link set inline in a line of text is exempt, as WCAG's target size
criteria exempt it. It also checks focus after an in-app link and reduced motion, and dark
mode (#77): axe again on each route with the system dark, the page color from the first
styled frame, dark print, and the wait times map's basemap switch (the precinct map's is a unit test, `precinctMapView.test.js`). The county's
layers, the City Board's layers, and the County and City wait time layers, are answered from
`docs/raw/fixtures/` (the wait times route and the County and City results routes at the time
those were recorded, so counts show) and every other outside request is blocked, so
it needs no network. The first run needs `npx playwright install chromium`. Add a route there
when the app gets a new one. In jsdom, without layout, `src/test/a11yPages.test.jsx` runs axe on home, the wait times page, privacy and
the two not-found pages, and `src/features/learn/learnA11y.test.jsx` on `/learn` with fixture
topics.

Page rules the checks rely on: every page has one `h1`, set with `tabIndex={-1}` so the app
can focus it after an in-app link (`App.jsx`), and its own tab title (`usePageTitle` in
`src/components/`, or the page's own layout effect: a title put back in a passive effect's
cleanup lands after the next page's layout effect set its own, leaving the old one in the tab).
A heading focused from script draws no focus ring, as it is not a control (`src/index.css`, #78);
everything a voter can operate keeps it.
A heading inside a section keeps the level below that section's heading.

Before each election, check by hand what automation cannot: VoiceOver on iOS, TalkBack on
Android and NVDA on Windows through search, results, share and a topic page; 200% browser
zoom on a desktop; and Windows High Contrast (forced colors).

## Performance

The target is a mid-range phone on a weak signal (#27). `npm run test:perf` runs
`e2e/lighthouse.js`: Lighthouse's mobile emulation at 360 x 640 px on simulated slow 4G with a
4x CPU slowdown, three runs each of `/`, `/p/CC007`, the City precinct `/p/W01P12` (#95), `/early-voting` and `/learn` against the production build
(`/` and the two results pages at a pinned clock during early voting, the evening after it closes and Election Day morning, so the home page's dot map, #184, is measured)
(`vite preview`). It fails when a page's median performance score is under 90, its median LCP
is 2.5 s or more, or any run reports no LCP or ends without the page's own content (its
heading, and on the results page the precinct line under it, the municipality, districts, sample ballot link and each
polling place's name and ZIP; on the City results page the City Board's Election Day rule,
the districts card, the City Board's sample ballot PDF link and each polling place's name; on the wait times page each site's name, or
the note that early voting has ended). Each run also takes Lighthouse's SEO category (#98):
every scored SEO audit must pass on every route, except `is-crawlable` on the precinct pages,
which must fail there because they are `noindex` (`SEO_EXPECTED_FAILURES` in
`e2e/lighthouse.js`, each with its reason). It writes the report of the run with the median score to
`lighthouse-reports/` (CI keeps it as the `lighthouse-reports` artifact). No live service is
called: Chromium resolves the county's ArcGIS host (the City Board's layers are on it too) and the basemap host to a local HTTPS
server, and every other host except `localhost` to nothing. That server answers the County
and City layers (GET, or a point query's POST) from `docs/raw/fixtures/` (shaped to the query's `outFields` and `geometryPrecision`, gzipped
like the county's service) and the basemap style with a blank style (`BLANK_STYLE` in
`e2e/fixtures.js`), each after a 600 ms wait (four simulated round trips, about what a phone
waits on a new connection): no real ArcGIS host answers within a frame, and an answer that
arrived before the first paint made Lighthouse count the layers' connections toward LCP even
for text that needs no data (#156). It needs `openssl` for the local server's throwaway certificate, and
Playwright's Chromium (`npx playwright install chromium`).

`src/test/build.test.js` keeps the JavaScript the first load fetches under 120 KB gzipped and
fails on any web font: the app uses the system font stack. Rules the scores rely on:

- Load anything large or slow to start only when it is needed, as the map is (see Map).
- Give a loading placeholder at least the size of what replaces it, so the page does not jump.
- Show text that needs no data while the data loads, in the place and at the size the loaded
  page shows it, so the page's largest text paints without waiting for a request (#151,
  #156). Which text is largest can change with the election calendar (the results summary
  has an early voting part only while early voting runs), so the Lighthouse run measures each
  results page at pinned clocks (during early voting, the evening after it closes, Election
  Day morning) and `e2e/a11y.e2e.js` checks at the same clocks that every LCP entry at
  360 x 640 comes before the data.
- Start the requests a page needs together, not one after another: the results page asks for
  the polling places, the early voting sites, the County's polling place rooms and (without a
  looked-up point) the outline while the precinct loads. Precinct pages also preconnect to
  the ArcGIS host those requests go to (the `Link` header, see Deploy), which Lighthouse's
  simulation does not credit.
- Ask ArcGIS only for the fields the app reads: `PRECINCT_FIELDS`, `POLL_FIELDS` and
  `ROOM_FIELDS` in `src/data/arcgis.js` (the room layer also holds staffing, photo, turnout and
  task fields, which the app never asks for). A query that names a field the layer lacks fails, so
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
there instead of color values. Two exceptions are checked on their own: the `theme-color` metas in
`index.html` (#76, #77, below) and the site icons in `public/` (#79): a favicon
cannot read the page's CSS, so `favicon.svg` writes the light `--color-primary` and
`--color-on-primary` as hex (one icon for both schemes), and `favicon.ico`, `apple-touch-icon.png`
and the web app manifest's icons in `public/icons/` (#25) are drawn from it. A build test fails on
red or blue in `favicon.svg` (not in the raster icons); when those tokens change, redraw them all.
`node scripts/draw-icons.mjs` redraws the manifest's icons from `favicon.svg` (with Playwright's
Chromium: `npx playwright install chromium` first). The maskable
icons fill their square with `--color-primary` and keep the mark at 80% of its size, inside the
central circle a launcher never crops. The manifest's `theme_color` and
`background_color` are the light `theme-color` meta's value (a manifest has one color, so an
installed app's launch screen is light in dark mode too); `src/test/manifest.test.js` checks the
colors and the maskable icons' safe zone.

The tokens (#76), each with its role and minimum contrast beside it in `src/index.css`:

- Neutrals, near gray with a faint teal cast: `surface` (the page), `surface-raised`,
  `surface-sunken`, `ink` (text and the focus ring), `muted` (secondary text), `border`
  (decorative lines only) and `border-strong` (the edge of a control with no fill, 3:1).
- Brand: one hue, deep teal near 185 (the owner's choice; blue starts at 200): `primary` for
  links, buttons and the lead card's edge, `primary-hover`, `primary-pressed` and
  `on-primary`.
- Semantic pairs, `*-fill` for a notice's background and `*-ink` for its edge and icon:
  `danger` (burnt orange, never red), `warning` (amber), `info` (the brand teal) and
  `success` (green, free because the brand is teal). Color is never the only cue: a notice
  also has its kind's icon and edge (`Notice` in `src/components/`), which stay in forced
  colors (the icon then in the system text color), and its text stays `ink`.
  The home page's election date pill also uses the `info` pair, its ink as text on its fill.
- The wait time ramp, `wait-1` to `wait-5`, for map markers and their legend only (see Map),
  and `wait-number-light` and `wait-number-dark` for the marker numbers on it, the same in
  both themes.
- `shadow`: `ink` at 12%, the one color the `shadow-card` and `shadow-popover` shadows use
  (in dark mode, near black).

Dark mode (#77) follows the system setting, with no toggle (one would need storage, see
Privacy). Every token but the marker number pair has a dark value in `src/index.css`, under
`@media screen and (prefers-color-scheme: dark)`, so print stays light; `color-scheme: light dark`
lets form controls and scrollbars follow, and the page itself paints `surface`. A new token
gets a dark value too (a test fails on one left out).

`src/test/contrast.test.js` checks every text and control pair the tokens make against WCAG
2.1 AA, in both themes (the wait markers are checked in `mapColors.test.js`): text 4.5:1 on
every surface and fill, `border-strong` 3:1. A new token or pair goes into it. The browser's
chrome color, one `<meta name="theme-color">` per scheme in `index.html`, is each theme's
`surface` written as hex; `src/test/theme.test.js` checks they match and are not red or blue,
so change them together. `e2e/a11y.e2e.js` runs axe on every route in both schemes and checks,
on five routes, that a dark page paints the same dark page color on every frame once its
stylesheet applies; before that, the `color-scheme` meta lets the browser draw its own canvas
dark.

## UI

The pages share a few components in `src/components/` (#78). Use them instead of writing a
link's or a button's classes in a feature file (`src/test/sharedStyles.test.js` fails on a local
`linkClass`, `buttonClass` or the like):

- `TextLink`: any link that reads as a link. `to` for a page of the app (wouter), `href` for
  another site, a file, a `tel:` number or a full page load. `variant="inline"` (the default) in
  a sentence, `tap` on a line of its own (44 px), `row` for a full-width row in a list of places
  to go, `nav` for the site header. `LINK` is its look, for text drawn in a link's place.
- `Button`: anything pressed. `primary` for a screen's one main action, `secondary` beside it or
  for Try again, `quiet` for small actions in a list (Show more, Share), `size="sm"` in a row.
  `busy` keeps it focusable and ignores presses while work runs. With `href` or `to` it is a
  link drawn as a button (the sample ballot, directions). `buttonClass()` is its look, for a
  placeholder that holds its place.
- `Card`: a titled section of secondary detail (the results cards). `CARD` is its box, for a
  placeholder; `CARD_EMPHASIS` is the box of the one answer a page leads with.
- `Notice`: a message set apart, with its kind's fill, edge and icon: `info` (where to go
  instead, still working), `warning` (this precinct has nothing to vote on), `danger`
  (something failed, with `role="alert"`) or `success`. Where the alert's
  live region must stay mounted while empty, keep the region and render the Notice inside it.
- `Disclosure`: folded secondary detail (hour lists, sources), opened for printing.

Sizes come from the type scale and tokens in `src/index.css`: `text-title` for a page's `h1`,
`text-heading` for a section's `h2`, `text-subheading`, then `text-base` and `text-sm`;
`rounded-control` and `rounded-card`; `shadow-card` and `shadow-popover`. Spacing is Tailwind's
4 px step.

## Election config

Everything that changes between elections (layer paths, dates, hours, election-specific links)
lives in `src/config/election.js`, or for what only the City's results cards read, in
`src/config/cityResults.js` (below), so the next election is an edit to those files. Do not write
those values anywhere else in `src/` or in `index.html`. A test fails when it finds the
election name, an election-specific URL, a date, a layer or service name, the field name, the
filter or the sample ballot pattern from the config there; it does not check hours, so read
those from the config too. Text under `content/` may repeat them.

The config holds the shared election values and one block per jurisdiction, `county` and
`city` (#86). The default export still reads as the County block for code that serves only
County voters. The results page gets its jurisdiction's data adapter and official lookup link
from `src/data/jurisdictions.js`, picked from the precinct code's shape (`/p/CC007` is the County,
`/p/W01P12` the City; [docs/data.md](docs/data.md#jurisdictions-and-precinct-codes)), and
the results' own links to a board follow that jurisdiction: on a City precinct's page, the
official lookup, the polling places card, the map credit and the error
screen link the City Board (#89). The footer lists both boards on every page. The test also fails on a City block's layer, service, filter or field name (except the common
words `name` and `district`) written outside the config.

**The City chunk (owner decision on #147).** Code and config only St. Louis City needs load on
demand, in one chunk, `src/cityChunk.js`, through `loadCityClient()` in
`src/data/jurisdictions.js`: the City's data client, `src/data/cityArcgis.js` (#87), the City-only
results UI (its early voting card and its part of the results summary, Election Day rule, districts card and sample ballot card) and `src/config/cityResults.js`. The City
results, `locate()` (#88) and the wait times page load it. A City-only component is read from it
with `cityComponent(name)` (`src/features/lookup/cityComponent.js`) inside a `Suspense`. Once
the chunk has loaded (`loadedCityClient()`) it renders at once without suspending, so nothing at
the top of a City results page appears late and pushes the page down (#81); never
`React.lazy` a file of its own, which splits code the first load shares into another chunk and
costs more than it saves (#147). The City block in `election.js` keeps only what the first load
reads (the address search, the adapter, the wait time loop); a City-only value only the City's
cards read goes in `cityResults.js`. `src/test/build.test.js` fails when that file's values reach
the first load. Copy is the exception: every string is in `src/i18n/en.json`, which the first load
carries.

The polling places layer the app keeps in memory (`getPolls` and `getAbsenteeSites`) has a max
age (#84): `layerMaxAge` in the config, shorter on Election Day (the date in the config's time
zone). `isFresh` and `layerMaxAgeMs` in `src/data/freshness.js` are the one rule for "too old":
any later refreshed layer (wait times, City layers) uses them rather than its own expiry. The
polling places and early voting cards fetch again when the tab is shown after the max age, so a
tab left in the background for days shows a moved polling place when the voter returns to it
(not while the tab stays visible); a refresh that fails keeps the rows shown and says when they
were loaded. A service worker (#183) must not keep serving an answer older than this max age.

### Wait times: the first day counts appear

The early voting line counts (`waitTimes` in the config) come from each board's own layer. On
the first day a board's counts appear, and again after either board changes its dashboard:

1. Run `node scripts/check-config.mjs` while sites are open. Each wait source's line must say
   fresh, and the County line must say 0 reports match no site.
2. Open `/early-voting` next to each board's own page (the links under Official sources). For
   each board, pick three sites and check the count and the report time match, and that the
   times read as Central time (the two pages should agree to the minute).
3. Check the unit: both boards report people in line, not minutes (docs/data.md), and the page
   always says "people in line". If a board's page starts showing minutes, turn that source off
   (step 4) and open an issue: changing its `unit` alone does not change what the page says.
4. If a check fails or counts are wrong, set that source's `enabled` to `false` and deploy. The
   page then shows the sites and the official links without counts.

### Wait times: Election Day

On Election Day (`electionDate`, in the config's time zone) the same client reads each board's
Election Day source instead (#107): `waitTimes.county.electionDay` (its own layer, filter and
polls layer join field, `username` today) and `waitTimes.city.electionDay` (the City's
Election Day polling places), open by `electionDayHours` rather than the early voting hours.
The polling places card then shows each listed place's count from its own board only, a
"Shortest line within 5 miles" sort and a link to `/early-voting`, which lists every polling
place of both boards that day; the precinct map colors its markers by the same rule as the wait
times map (Jenks classes of the current counts, see Map). On 2026-10-22 the County's view kept only early voting reports (docs/data.md, Wait
times), so until the County publishes Election Day counts every County place shows no count.
When it does, point `waitTimes.county.electionDay.layer` (and `where`) at the view it names and
run `node scripts/check-config.mjs`: a config change, nothing else. Set an `electionDay.enabled`
to `false` to turn one board's Election Day counts off.

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
any `.gov` site (the County Board's website is on the county's `.gov` site, and the City
Board's on the City's, `www.stlouis-mo.gov`) and the County Board's ArcGIS portal, listed in
`src/features/learn/content/officialSources.js`; add a host there in a reviewed change, never
per topic.

Each topic serves City and County voters alike (#94). Where the two boards' facts differ, give
each its own short `### City of St. Louis` and `### St. Louis County` section (or a `##` section
for a City-only topic), or one sentence per board, each citing that board's own page; say "your
election board" where a sentence holds for both. The tests hold a weaker line:
`src/test/cityContent.test.js` fails when a paragraph or list item that names the City cites
only County Board sources or none (a City Board page, a state source or any other non-County
source passes), and when a topic that names the City lists no City Board source;
`src/test/citySections.test.js` does the same for blocks under a City heading and blocks that
say "the City", and counts County URLs on `www.` as County sources.

A new topic also needs its rewrite in `render.yaml` (see [Deploy](#deploy)); the tests fail
until it has one.

For each new election, re-read every topic's sources, then update its `election` and
`lastVerified`; the build fails until you do. `src/features/learn/topics.js` loads the topics
(`getTopics` and `getTopic` for summaries, `loadTopic` for a body) and
`src/features/learn/TopicArticle.jsx` renders one.

**Topic bodies load with their pages (owner decision on #147).** The first load carries only
each topic's summary (id, locale, title, group and the intro its description is cut from, made
by `topicSummary` in `src/features/learn/content/topic.js`), which `/learn`, the result cards'
links and the page heads read. A topic's text and sources are a chunk of their own, loaded by
`loadTopic()` when its page renders; until then the page holds a screen-tall placeholder. The
build loads every body before it pre-renders, and `src/main.jsx` loads a pre-rendered topic's
body before hydrating it, so its static HTML stays on screen (and stays, as a plain page, if the
body cannot load). Anything new that only a topic's
page reads belongs in the body, not the summary. `src/test/build.test.js` fails when a topic's
text reaches the first load.

The "How to vote" pages (#23) are `/learn`, the index, and `/learn/<id>`, one topic. With no
topics, `/learn` says the guides are not ready and links to both boards' sites and the
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
request that fails or times out after its retries (a request whose second try timed out gets 75 s
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
names, election values from `src/config/election.js` (`electionName` is only the health
check's log line, so it needs no value per language), and the names of the address search
services and their data (from the geocoder modules, as the privacy notice requires) are shown as
they are. So are the home page's tab title and its search and link-preview description, both
`index.html`'s (also `site.name` and `site.description` in `en.json`, which a test keeps the
same, for the pre-rendered pages and in-app navigation), the map credit's names and MapLibre's own
built-in text (its gesture hints and the map's label). The words around those names, such as
"address points" and "contributors", are messages. ESLint's `react/jsx-no-literals` fails on words typed straight into JSX.

To add a language, such as Spanish: copy `en.json` to `src/i18n/es.json`, translate the
values (keep the keys and the `{...}` names), and add its line to `LOCALES` in
`src/i18n/config.js`. A key it lacks falls back to English. The language switcher appears once
there are two languages; choosing one loads its file, sets `<html lang>` and redraws the page
in it, keeping focus and what the page has loaded. The site always starts in English. Dates are formatted for the language in the election's time zone,
`America/Chicago`, and distances for the language too.

## Data health check

Before each election, after editing `src/config/election.js`, check the live layers it names,
County and City:

```sh
node scripts/check-config.mjs [--layer <key>=<path>] [--ballot-sample <n|all>] [--warnings <file>]
```

It checks that each configured layer answers with the geometry and every field the app reads,
that the precinct count is in a sane range, that every `In Election` precinct's sample ballot
link parses and its file name names that precinct (and that 5 random links serve a PDF whose
`Content-Disposition` file name names the same precinct), that every precinct's congressional
district is a district on the map in effect (`congressionalMap` in `src/config/election.js`,
the 2022 map for November 2026, #150), that the absentee filter finds sites with hours in the
config, how many Election Day places (by `loc`) and early voting sites (by `loc_abs`) have no
room in the polling place rooms layer (#100: a WARN naming them, never a failure, since a place
then shows without its room), and that one known point per County Council district lands in a precinct
in that district and inside the county boundary layer, while a point in St. Louis City lands in
neither. For the City block (#87), it checks each City layer has the fields the app reads, that the
precincts are a sane count and every ID reads as a City code, that the Election Day and early
voting filters find sites with an id, name and address (a WARN when the Election Day count is
not the config's `pollsListed`, the count the City Board's page gives), and that City Hall lands
in a City precinct, a ward and the City outline while a County point lands in neither a City
precinct nor the outline, and that the City's sample ballot (`sampleBallot` in
`src/config/cityResults.js`, #92) answers HEAD with a PDF. The City publishes one ballot for
all precincts, so the County's rule that a ballot names its precinct does not apply to it. A
site filter that finds no site fails. For each
wait time source in `waitTimes` that is turned on (County and City early voting
line counts, or on Election Day each board's Election Day source, judged against every polling
place and Election Day hours; before Election Day the County's Election Day filter is run on its
layer every day, and a separate Election Day layer's fields are checked), it checks the layer has every field the config names, then prints one line naming
the board and whether its counts are fresh: open sites, how many have a count the app would show
now, County reports that match no early voting site, and the newest report time. An empty County
view while sites are closed passes. Sites open with no fresh count, County reports that match
no site (counted, never named: the senders are user names), City hours text the app cannot
read, or a City wait filter that matches no row are a WARN: printed, written to `--warnings <file>` if given, and never a failure. It
prints PASS, FAIL, SKIP or WARN per check and exits 1 on any failure or skip; a wrong
layer path fails with the config key, the path and the service's error. `--layer` tries another
path for one County layer without editing the config. `--ballot-sample` checks that many random sample
ballot links instead of 5, or every link with `all` (one request each to the county's portal, so
run it by hand, for example once before Election Day, not on the schedule). The thresholds and known points are at the top of
the script.

`.github/workflows/data-health.yml` runs this check, `scripts/check-geocoder.mjs` and
`scripts/check-content-links.mjs` every day at 12:00 UTC until Election Day is over in the
config's time zone, and on demand from the Actions tab (**Data health**, **Run workflow**).
During early voting (the first `from` to the last `to` in `earlyVoting.schedules`) and on
Election Day it also runs this check alone every 2 hours from 14:00 to 22:00 UTC, and on
Election Day at 23:00 and 00:00 UTC too (one of them is 6 p.m. Central), so a board that starts
or stops reporting line counts is noticed the same day; `scripts/electionWindow.mjs` decides which run
does what, and imports nothing, because it runs before `npm ci`. Warnings go on each run's
summary page. On
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
City address, for example), the City of St. Louis's own geocoder is asked next, and a City
parcel opens its City precinct (#88); its parcels are also suggested after the county's. When
neither has a match, or no county layer answers, it falls back to the public
[Photon](https://photon.komoot.io) geocoder (OpenStreetMap data). Every answer that could get
a county precinct is then checked with the City's geocoder, unless the text
holds a ZIP entirely outside the City: when the City has the same address in another ZIP, the
voter who typed the City's ZIP gets the City precinct and one who typed no ZIP is asked for it
(no match; a picked suggestion's ZIP counts as typed, so a pick opens the precinct of the
jurisdiction its label names), when both list it in one ZIP the answer is no match, and when the City geocoder fails or is slow, the app says address search is not working,
never a county precinct (#58, #18). `src/data/geocoder.js` builds that chain, `src/data/countyAddress.js`,
`src/data/photon.js` and `src/data/cityAddress.js` implement the sources and
`src/data/addressMatch.js` holds the strict matching rules they share; a test fails if any
other app file names a provider. docs/data.md (Geocoding, County address points, City check)
explains every rule. `src/features/lookup/locate.js` asks the City's precinct layer for a
place the geocoder names as the City, and for a point near the City that the county's
precinct layer misses.
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
Hall, the City addresses of #58 typed with the City's ZIP or picked from the City's suggestion,
and other City addresses (5010 Nottingham Ave 63109, addresses near the City line) open a City
precinct, typed and picked from the suggestions, that those #58 addresses typed with no ZIP are
no match and picked from the county's suggestion open the county precinct, that addresses outside both (St. Charles, out of state) get no
precinct, and that addresses the county and the City both list in one ZIP (6135 Horton Pl
63133, 1 Brookings Dr 63130) are no match. It exits 1 if the chain puts any address in the
wrong precinct, a City address does not open a City precinct, an address outside both gets a
precinct, a pick does not open its label's jurisdiction, a shared address or a twin typed with
no ZIP is not no match, or one of those gets a precinct with the City geocoder blocked. "No match" is
allowed: the app then points the voter to "Use my location" and both boards' official
lookups. Results are recorded in `docs/data.md` under Geocoding.

## Errors

When a service is slow or down, the app says so and offers a way forward (#18); it never
guesses a precinct. "We could not find that address" means the sources that answered had
no single answer: none has the address, two addresses or two precincts fit, the county and
the City both list it in one ZIP, the City has it in another ZIP and no ZIP was typed, or the
only fit is not exact. A lookup that could not finish says address search is not working instead: every
source down, the City check or the county's precinct check failing or slow, Photon down after a county no
match, the City lookup failing with Photon finding nothing, or no county layer answering with
Photon finding nothing. (With the live county
layer down, the 2023 hosted copy's no match counts as an answer.)
Every source down was already a `GeocoderUnavailableError`; `createGeocoder` reports the
other cases that way only when the caller passes `reportUnavailable`, which the app does;
without it the chain answers no match for them, as the #49 and #58 tests and
`scripts/check-geocoder.mjs` expect. Every lookup error links both
boards' official lookups next to Use my location (the address could be in either, #93), and every one but a no match has a Try
again button that repeats the same search, or the same device location without asking the
device again, until the voter edits the address. The precinct page and its polling places
and early voting cards show their own failures, each with Try again (the map still removes
itself, #13); a failed page load moves focus to its message. A failed refresh of a list already
shown keeps its rows and says when they were loaded instead (#84).
After `SLOW_MS` (`src/features/lookup/slowNotice.js`), the lookup and the precinct page say
they are still working. When the browser reports no connection, the lookup's and the precinct
page's messages say the voter appears to be offline (cached polling places wait for offline support, #183). A page that throws
while rendering shows a plain error screen (`src/components/ErrorBoundary.jsx`) with the
precinct's own board's lookup on a precinct page, and both boards' lookups anywhere else (#93), and
`src/main.jsx` keeps React from logging caught errors. `e2e/failures.e2e.js` breaks each
service in turn (network refusal, a request that never answers, 5xx) in a real browser.

## Privacy

Addresses are sensitive. The app itself never puts a typed address or its coordinates in the
URL, `localStorage`, `sessionStorage`, IndexedDB, cookies, logs or analytics. Its only analytics
are the cookieless, redacted page views and fixed-label voter action events below (and GA's own
events, with the same redacted page fields), off until the measurement ID is set. Every request that carries a typed address or coordinates uses `cache: 'no-store'`,
no cookies and no referrer, and sends them in a POST body, never the URL, where the service
accepts one (#38): the county's address layers, the City geocoder and the County and City
precinct and boundary point queries. Photon has no POST endpoint, so it gets the typed text in a GET query string;
the notice says so. A new request that carries either must do the same, and a service worker
(#183) must not put those requests in Cache Storage, which `no-store` does not cover, and must not
intercept or cache requests to Google's analytics hosts. The plain-language
notice at `/privacy` (`src/features/privacy/privacyCopy.js`, its text under `privacy` in
`src/i18n/en.json` and every other language's file) says what each third party gets;
change it in the same change as any new service or any change to what is sent. `src/test/no-storage.test.js` fails
when app code under `src` uses browser storage, cookies or the console, and
`src/test/addressPrivacy.test.jsx` runs a lookup and checks storage, cookies, Cache Storage
entries, IndexedDB database names, the URL, the title, the head tags (#98) and the console for the address (jsdom has no
Cache Storage or IndexedDB, so those two run only where they exist). A test also fails when the
Content-Security-Policy allows an origin the notice does not name. The policy names Google
Analytics' hosts only while its measurement ID is set (#191), and the notice names them then
(`PrivacyPage.analytics.test.jsx` checks that state).

The tests run in jsdom, so check a real browser by hand before each election: look up an
address and use Use my location, then in the browser's devtools confirm that Application shows
no Local Storage, Session Storage, IndexedDB, Cookies or Cache Storage entries for the site and
that the URL is `/p/<code>` only. In the Network panel, confirm that the requests carrying the
address or the coordinates go only to the hosts the notice names, that the point queries are
POSTs with no coordinates in their URL, and that none of those requests comes back from the
HTTP cache.
The wait times page's "Sort by distance from my location" keeps the device's position in
component state only, to measure distances on the device: it is not sent in any request, and
never reaches the URL or storage.
Use my location turns away a fix with an accuracy radius over 100 m before any query (#83), so
for this check use a phone with precise location on, or an emulated location whose accuracy is
set to 100 m or less. If it says the location is only a rough estimate, press it again.

### Google Analytics

Page view and voter action counts with Google Analytics 4 (#69, #70), in `src/analytics/`, the only app code that
calls `gtag`, reads the `dataLayer` or names Google's analytics hosts (`src/test/analyticsOnly.test.js`
fails on any other; the notice's text names them too, and `render.yaml` once the ID is set).
It is off while `gaMeasurementId` in `src/config/site.js` is empty, as it ships (owner decision
on #69), and the privacy notice then says the site has no analytics; once the ID is set, the
notice drops that and adds a "Visit counts" section naming Google's hosts and what they get. The
notice and the pre-rendered `/privacy` page follow the same config, so they are true in both
states. With the ID set, GA loads only:

- on the production origin (`siteUrl`): the shipped build never loads it on PR previews,
  `localhost`, `vite preview` or the e2e and Lighthouse runs (only tests that pass their own
  origin and ID, and `e2e/analytics.e2e.js`'s own build, turn it on);
- when the browser does not send Global Privacy Control (`navigator.globalPrivacyControl`);
- after the `load` event, in idle time: `src/analytics/ga.js` is a chunk of its own, and Google's
  script tag is added by it, so neither is in the first load (#27). The CSP has no inline script.

What it sends: Consent Mode defaults every storage and ad signal (`analytics_storage`,
`ad_storage`, `ad_user_data`, `ad_personalization`) to `denied` before anything else, and
nothing grants them, so GA sets no cookies and needs no banner. `config` turns off its own page
views, Google signals and ad personalization. The app sends one page view per navigation, with
`page_location` set to `siteUrl` plus the route pattern (`/`, `/p/:precinct` for every precinct
page in any letter case, County or City, `/learn`, `/learn/<topic id>`, `/early-voting`,
`/privacy`, `/not-found` for anything else; never a query string or hash), a fixed `page_title`
per page type and an empty `page_referrer`, and sets the same values with `set` for GA's own
events. Never put a page field in `config`: gtag ranks event over config over set, so a config
value would outrank every later `set` and GA's own events would keep reporting the first page.
A new route in `src/App.jsx` needs its pattern in `routePattern` (a test fails until it has one).
`e2e/analytics.e2e.js` builds the app with a test ID, serves it at the production origin and
checks a lookup's page views, the events of pressing the sample ballot, a directions link and
Share, and every request to Google's stubbed hosts.

Voter actions (#70) are counted with `track(name, params)` from `src/analytics/index.js`;
components call nothing else. `EVENTS` in `src/analytics/ga.js` is the allowlist: each event's
parameter names and the fixed values each may take. An unknown event is not sent, and an unknown
parameter or value is dropped. It is in the lazily loaded `ga.js`, so the first load carries only
`track()`, its queue, the call sites and the lookup's outcome map, and `track()` does nothing while GA is off. A press is counted from its click
handler, never waiting on it and never preventing the link's default. The County and City cards
send the same events, with no jurisdiction parameter, though `no_precinct` and `city_referral`
tell County or City for a search that found no precinct (the notice says so).

| Event | When | Parameters |
| --- | --- | --- |
| `lookup_result` | an address search or Use my location finishes | `source`: `address`, `location`; `outcome`: `precinct` (County or City), `no_precinct` (taken to be in the County, no precinct found), `city_referral` (sent to the City Board: its precinct not found, or the City's layer not answering, #88), `out_of_area`, `no_match`, `unavailable`, `failed`, `offline`, and for the device `denied`, `timeout`, `coarse` |
| `sample_ballot_open` | the County or City sample ballot link is pressed | none |
| `directions_open` | a directions link is pressed | `card`: `polls`, `early_voting` (the results summary's buttons count as their card's), `wait_times`; `provider`: `google`, `apple` |
| `official_lookup_open` | a results, error, referral or status message's link to a board's official lookup is pressed (not the How to vote topics' links) | `card`: `polls`, `early_voting`, `sample_ballot`, `districts`, `lookup_error`, `precinct_error`, `wait_times`, `error_screen`, `referral` (the out-of-area and City referral notices), `status` (the precinct status banner) |
| `share` | Share this page finishes | `method`: `share_sheet`, `clipboard`, `manual` (closing the share sheet is not counted) |
| `retry` | a Try again button is pressed (a retried lookup sends its own `lookup_result` too, so lookups count per attempt) | `where`: `lookup`, `precinct`, `polls`, `early_voting`, `districts`, `wait_times` |

`src/features/lookup/lookupOutcome.js` maps the lookup's outcome kinds to those labels. A value is
never an address, coordinates, a precinct code, a place's name, a ward or district, a distance, a
URL, anything typed or a time. A new event, parameter or value goes in `EVENTS` and the privacy
notice's "Visit counts" text in the same change; `src/test/analyticsPrivacy.test.jsx` runs real
lookups and presses with GA forced on and fails on any voter detail in what is sent.

Before setting the ID, apply these settings in GA, since they live there, not in code:

1. Create a GA4 property and a web data stream for `mapthevotestl.com`.
2. In the stream's Enhanced measurement, turn off page changes based on browser history events
   (the app sends its own redacted page views), outbound clicks, file downloads, site search and
   form interactions: each sends real URLs (a sample ballot PDF link names the precinct, and a
   directions link carries the polling place's coordinates, so outbound clicks must stay off).
   Turn scrolls and video engagement off too; the app does not use them.
3. In Admin, Custom definitions, add event-scoped custom dimensions for the event parameters
   `source`, `outcome`, `card`, `provider`, `method` and `where` (#70), so reports can break the
   events down by them (Realtime shows them without this).
4. Turn Google signals off, set data retention to the shortest option (2 months), and leave every
   Google Ads and other product link off. In the property's data collection settings, turn off
   granular location and device data collection.
5. Set the ID and add the CSP hosts in the same change. Put the `G-` ID in `src/config/site.js`,
   and in `render.yaml`'s Content-Security-Policy add `https://www.googletagmanager.com` (the
   loader) to `script-src` and `connect-src`, and `https://*.google-analytics.com` (the
   collection hosts) to `connect-src` and `img-src` (`ANALYTICS_CSP` in
   `src/analytics/csp.js`). While the ID is empty the policy names no Google host (#191, owner
   decision): `www.googletagmanager.com` can serve any Tag Manager container.
   `src/analytics/csp.test.js` fails until the policy and the ID agree, naming each source to
   add or remove, and `npm run smoke` checks the live header the same way, so run it from the
   commit that deployed. The other tests pass with the ID empty or set: the unit tests of the
   notice pin each state themselves, and `e2e/analytics.e2e.js` replaces whatever ID is there
   with its own (`vite preview` sends no CSP, so that spec runs without one).

Manual check before each election, once the ID is set: on the live site, open `/`, run a lookup
and open a topic. In devtools, Application shows no cookies (`_ga*`), Local Storage or Session
Storage for the site; each `collect` request in Network has `dl=https://mapthevotestl.com/p/:precinct`
(never a real code) or another route pattern, a fixed `dt`, no `dr` (or an empty one) and
`gcs=G100` (all storage denied), and GA's own events (`user_engagement`) carry the current page's
pattern, not the first page's. Open a precinct's sample ballot link and confirm no `click` hit
goes to Google (enhanced measurement's outbound clicks are off: its `link_url` would name the
precinct), and that the `sample_ballot_open` hit (`en=sample_ballot_open`) carries no link or code;
press a directions link and Share, and check their hits carry only the labels in the table above
and that no `click` hit goes to Google for the directions link (its URL holds the polling place's coordinates). In GA's Realtime report, the page views show under the redacted paths. With Global Privacy
Control on (Brave, or Firefox's setting), no request goes to Google.

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
(`src/features/lookup/precinctMapView.js` and the wait times map's
`src/features/waitTimes/waitTimesMapView.js` are the only files that import it), and its worker
ships as a same-origin file, so the Content-Security-Policy needs no `blob:` source. The app
ships its own few MapLibre layout rules (`src/features/lookup/precinctMap.css`) instead of
`maplibre-gl.css`, which embeds `data:` icons and party blue.

The early voting wait times page (`/early-voting`, #104) has its own map, open on arrival
(#172; "Hide map" collapses it) and, like the precinct map, loaded only once it scrolls into
view, in a box of fixed height, on the same terms: the list holds everything on it, and it goes
away on any failure. Its numbered markers match the list. A site with a current line count is
filled by its class (#172): the fresh counts listed, both boards on one scale, are split by Jenks
natural breaks (`src/features/waitTimes/jenks.js`, its own chunk, out of the first load),
recomputed whenever the counts change. The number of classes is one per distinct count when
there are fewer than 3, else the smallest of 3, 4 or 5 (at most the number of distinct counts)
whose goodness of variance fit reaches 0.9, else the largest of those. Each class runs from its own lowest count to
its highest, so each range starts and ends at a count shown. The colors are five steps of a BrBG-style ramp, teal
through tan to brown (`--color-wait-*` in `src/index.css`, used only for markers and the legend;
k classes use a fixed subset, `WAIT_RAMP` in `src/features/waitTimes/waitColors.js`), each
marker outlined in ink so it is at least 3:1 against the basemap
(`src/features/waitTimes/mapColors.test.js`). The legend lists each class's range with the unit
("0 to 3 people", or "5 people" for a class of one count) and is hidden when no site has a count; a stale or missing count is never
colored. On Election Day the precinct map's markers and legend follow the same rule while the
polls are open (#107), with classes from that board's counts at the polling places listed.

The basemap is [OpenFreeMap](https://openfreemap.org)'s Positron style, or in dark mode its
Dark style (#77), which is all grays: free, with no API key
or account, and its terms allow embedding it. Both maps pick the style for the system color
scheme, read their token colors at each style load, and switch style when the scheme changes,
fetching the new style first so a failed request keeps the drawn map. A page printed with the
system dark leaves the maps out, so print stays light. Its attribution (OpenFreeMap, OpenMapTiles,
OpenStreetMap contributors) is shown as links under the map. Positron's water labels are blue and
its interstate shields slate blue, so the map draws every label in the muted token and
interstates with the gray road shield. The precinct outline is drawn in ink, not the brand
teal, which is within a shade of the ramp's first step (`mapColors.test.js` keeps it apart
from every step). Tile requests tell OpenFreeMap (and
Cloudflare, its CDN) which area is on screen: the precinct and its nearest polling places,
which depend a little on the searched point within the precinct, or, on the wait times page,
the early voting sites (on Election Day, the polling places). The `no-referrer` policy
keeps the page URL out of them. `src/features/lookup/basemap.js` holds the two style URLs and the
credits; to change the basemap, change that file and the origin in `render.yaml`'s
`connect-src` together, and check the new style's colors and sprite icons for red or blue. In
dark mode each marker keeps its ink outline, light there, and the ramp is the same but for a
deeper pale tan, so the light ink outline of the precinct stays apart from every step
(`mapColors.test.js` checks both themes, each on its basemap's land).

During early voting and on Election Day the home page opens with a small line count dot map
(#184), above the address search: every County and City site (on Election Day, every polling
place) on an inline SVG of the County and City outlines, with no map library and no tiles. It
uses the wait times page's sites and counts, Jenks classes and ramp; each dot also grows with
its class, and a closed site or one with no current count is a hollow gray ring. Under it are
the legend, the three open sites with the fewest people in line (with their board) or when
sites open again, and each board's rule that its sites are for its own voters. The whole map is
one link to `/early-voting`; the drawing is hidden from screen readers and the text carries the
data. Its code loads on demand with the wait times page's chunk, after the page's text paints.

It shows from midnight of the first early voting day (County or City) to Election Day's poll
close, in the config's time zone (`src/features/waitTimes/homeMapWindow.js`), and
`waitTimes.homeMap: false` in the config turns it off. The pages are pre-rendered before the
date is known, so the build writes a few hundred bytes of plain script from those dates,
`/assets/home-map-<hash>.js`, loaded first in every page's head (`src/prerender/homeMapScript.js`;
same origin, so the Content-Security-Policy allows it). While the window is open it marks
`<html>` with `data-home-map`, and `src/index.css` then reserves the map's box at the height of
its tallest state before the first paint, so nothing below it moves when the map arrives (the
e2e checks hold the app's script and compare the address search's position). Outside the
window, and with JavaScript off, the box takes no space. The box closes, leaving the home page
as it was, only when the map cannot be drawn (its chunk or a board's site list fails); stale or
missing counts keep it, with every site a ring and a line saying so, since closing it then would
move the page. The outlines are a committed module, `src/features/waitTimes/outline.js`, built
from the County's and the City's own boundary layers by `node scripts/build-outline.mjs`
(docs/data.md, County boundary); the daily data health check runs it with `--check`.

## Contributing

Open a pull request against `main`. Every pull request runs the CI gate above and needs it
green; run it locally first.

- **Voter information needs an official source.** Any fact a voter acts on (dates, hours, places,
  ID rules, deadlines, phone numbers) comes from an official source: the County or City board,
  the Missouri Secretary of State, Missouri statutes or another government site. Cite it next to
  the value (`sources` and `lastVerified` in `src/config/election.js`, or a topic's front matter
  under `content/`). The build rejects a topic link outside the official hosts
  (`src/features/learn/content/officialSources.js`). News sites, advocacy groups,
  campaigns and parties are not sources.
- **Stay nonpartisan.** Follow the [Nonpartisan statement](#nonpartisan-statement): no
  endorsements, candidate or measure commentary, or rankings, and no red or blue.
- **Election values go in config.** Anything that changes between elections goes in
  `src/config/election.js`, never in the code that reads it (see
  [Election config](#election-config)).
- **A change to what is sent to a service**, or a new analytics event, parameter or value, also
  changes the privacy notice in the same pull request (see [Privacy](#privacy) and
  [Google Analytics](#google-analytics)).

## License

No license has been chosen yet (#118), so the code is not yet open for reuse. Until a
`LICENSE` file is added, ask the owner before reusing it. Voter information and sample ballots belong to
their official publishers.
