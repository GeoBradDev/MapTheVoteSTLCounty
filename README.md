# MapTheVoteSTLCounty

## Development

`.node-version` pins Node for CI and Render; use the same version locally.

```sh
npm install
npm run dev           # start the dev server
npm run build         # build the static site into dist/
npm run preview       # serve dist/ locally
npm test              # run the tests once (npm run test:watch to watch)
npm run lint          # ESLint, including jsx-a11y rules
npm run format        # format with Prettier (npm run format:check to check only)
```

CI runs lint, format check, tests and build on every pull request and on push to `main`.

## Deploy

The site is a Render static site defined by the Blueprint in `render.yaml`: the build, the
publish directory, the custom domain (`mapthevotestl.com`), the SPA rewrite, the security
headers and the cache rules. `src/test/render.test.js` checks it.

- **Deploys:** a push to `main` deploys after CI passes (`autoDeployTrigger: checksPass`).
  A change only under `docs/` or to `README.md` does not build. Markdown under `content/`
  still builds, because the learn pages (#21) will be built from it.
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

## Address search

The address box uses the public [Photon](https://photon.komoot.io) geocoder (OpenStreetMap
data), called from the browser with no key and no server of ours. `src/data/geocoder.js`
picks the provider and `src/data/photon.js` implements it; a test fails if any other app file
names a provider.
To point a build at another Photon instance, set `VITE_GEOCODER_URL` (for example
`VITE_GEOCODER_URL=https://photon.example.org npm run build`). The Content-Security-Policy in
`render.yaml` allows only the default, `https://photon.komoot.io`, in `connect-src`; add any
other origin there too.

Check the geocoder against the live precinct layer before each election:

```sh
node scripts/check-geocoder.mjs [photon-base-url]
```

It geocodes 10 polling place addresses and exits 1 if any lands in the wrong precinct. "No
match" is allowed: the app then points the voter to "Use my location" and the county's
official lookup. Results are recorded in `docs/data.md` under Geocoding.

## Map

The results screen shows a small map of the precinct and the listed polling places (#13). It
is extra help: the list holds everything on it, its markers are hidden from screen readers,
and it is removed whenever anything fails or the browser lacks WebGL 2. MapLibre GL JS is
loaded with `import()` only when the map renders (`src/features/lookup/precinctMapView.js` is
the only file that imports it), and its worker ships as a same-origin file, so the
Content-Security-Policy needs no `blob:` source. The app ships its own few MapLibre layout
rules (`src/features/lookup/precinctMap.css`) instead of `maplibre-gl.css`, which embeds
`data:` icons and party blue.

The basemap is [OpenFreeMap](https://openfreemap.org)'s Positron style: free, with no API key
or account, and its terms allow embedding it. Its attribution (OpenFreeMap, OpenMapTiles,
OpenStreetMap contributors) is shown as links under the map. Tile requests tell OpenFreeMap
which area is on screen, about as precise as the precinct already in the URL; the
`no-referrer` policy keeps the page URL out of them. `src/features/lookup/basemap.js` holds the
style URL and the credits; to change the basemap, change that file and the origin in
`render.yaml`'s `connect-src` and `img-src` together.
