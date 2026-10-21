# Plan: MapLibre map, precinct outline and nearby polling places (issue #13)

Risk tier: High. It changes the production Content-Security-Policy (security), adds a WebGL
map whose behavior unit tests cannot exercise (tiles, gestures, workers), a lazy-loaded chunk
and a worker asset, and touches more than a few files. The run is unattended (dispatched by
the owner's orchestrator, which asks for sensible calls on low-stakes choices), so the plan is
committed without an interactive approval; the PR says so.

Domain skills:
- superpowers:test-driven-development: invoke.
- vercel-react-best-practices: invoke for the map component, its effect and the lazy import.
- chrome-devtools-mcp (chrome-devtools, a11y-debugging): invoke for the live drive (map
  renders under the production CSP, phone scrolling, failure path).
- context7: not applicable because the installed `maplibre-gl` ships its own `.d.ts` and
  `dist` files, which are the reference for the exact version used.
- frontend-design: not applicable because the map uses the existing card layout and tokens.
- expo, django, django-ninja, fastapi, claude-api, dataviz: not applicable because none of
  those stacks are involved.

## Basemap choice

OpenFreeMap's Positron style (`https://tiles.openfreemap.org/styles/positron`): free, no API
key, no registration, and its terms (openfreemap.org/tos, updated 2026-10-14) allow embedding
in a website. Style, TileJSON, vector tiles, raster tiles, sprites and glyphs all come from
the one origin `https://tiles.openfreemap.org`. Positron is a light gray style, which keeps the
map neutral. Attribution required by the tiles: "OpenFreeMap, (c) OpenMapTiles, Data from
OpenStreetMap" (the TileJSON `attribution`); OpenStreetMap's ODbL asks for "(c) OpenStreetMap
contributors". Both are shown as text links under the map.

## Acceptance criteria

1. The "Polling places near you" card shows a small map once its list has loaded: the
   precinct outline (neutral fill and line from the `primary` token, not red or blue), the
   looked-up point when there is one (memory only, never in the URL or storage), and the
   listed polling places as numbered markers whose numbers match the list, including places
   added by "Show more".
2. The map fits its bounds to the precinct outline plus the looked-up point and the listed
   polling places, with no fly-to or other camera animation.
3. MapLibre GL JS is loaded with a dynamic `import()` only when the map is about to render:
   the entry chunk contains no MapLibre code, and the map code ships in its own chunk plus a
   same-origin worker file. The build test checks both.
4. The map wrapper is `role="region"` with an `aria-label`. Markers are hidden from
   assistive technology and not focusable; the list is the accessible version. A short
   text legend says what the shading, numbers and dot mean.
5. Gestures: cooperative gestures, so one finger scrolls the page on a phone (two fingers
   move the map) and the mouse wheel zooms only with Ctrl or Cmd; rotation and pitch are
   off.
6. If MapLibre fails to load, WebGL is missing, the outline fails to load, the style or
   tiles fail before the map first finishes rendering, or the map has not rendered within
   15 seconds, the map is removed and the cards stay as they are.
7. The attribution (OpenFreeMap, OpenMapTiles, OpenStreetMap contributors) is shown as text
   links under the map, and the precinct and polling place data are credited to the county.
8. `render.yaml`'s Content-Security-Policy allows `https://tiles.openfreemap.org` in
   `connect-src` and `img-src`, and nothing else new: the worker is a same-origin file, so
   no `blob:` source is needed, and no MapLibre CSS with `data:` icons ships.
   `src/test/render.test.js` expects exactly that policy, and the comment in `render.yaml`
   that asked #13 to extend the policy is replaced by a description of what it allows.
9. No red or blue color and no `data:` URI in the CSS under `src` or the built CSS, as
   before.

## Files that change

- `package.json`, `package-lock.json`: add `maplibre-gl` (v6).
- `vite.config.js`: `worker.format: 'es'` if the worker build needs it.
- `src/features/lookup/mapBounds.js` (new, tested): the bounds of the outline, the point and
  the polls; `cssColorToRgb` to turn an `oklch()` token into the `rgb()` MapLibre parses.
- `src/features/lookup/precinctMapView.js` (new): the only file that imports `maplibre-gl`.
  Sets the worker URL, builds the map, outline layers and DOM markers, reports a failure.
- `src/features/lookup/precinctMap.css` (new, imported by the view): the few MapLibre layout
  rules the map needs (canvas, markers, cooperative gesture overlay, touch-action), written
  with tokens only.
- `src/features/lookup/PrecinctMap.jsx` (new, tested with the view module mocked): the
  region, the loading placeholder, legend, attribution, and the lazy import.
- `src/features/lookup/PollsCard.jsx`: render the map above the list with the shown rows.
- `src/features/lookup/resultsCopy.js`: map text.
- `src/data/arcgis.js`: cache `getPrecinctGeometry` per code (like `getPolls`) so the card's
  center fallback and the map share one request; a failed fetch is not kept.
- `render.yaml`, `src/test/render.test.js`: the policy.
- `src/test/build.test.js`: the entry chunk has no MapLibre code; a separate chunk and the
  worker file exist.
- `README.md`: a Map section (basemap, attribution, CSP, how to swap the style).

## Order of work

1. Plan commit.
2. `mapBounds.js` with tests (red, then green).
3. arcgis geometry cache with tests.
4. Install `maplibre-gl`; `precinctMapView.js`, `precinctMap.css`.
5. `PrecinctMap.jsx` with tests (mocked view): renders region, legend, attribution; hides on
   failure; updates markers when polls change; cleans up on unmount.
6. `PollsCard.jsx` wiring and its test.
7. CSP in `render.yaml` and `render.test.js`; build test for chunking.
8. README.
9. Gate, live drive under the real CSP (production build served with the `render.yaml`
   headers), phone emulation scroll check, failure path with the tile host blocked.

## Risks

- The CSP blocks something MapLibre needs in production (worker, images). Mitigation: live
  drive the production build with the exact `render.yaml` headers.
- The worker file's MIME type on Render: Vite emits it as `.js` under `/assets/`, which
  Render already serves as JavaScript (the smoke test checks a hashed asset).
- Cooperative gestures still capturing the page scroll on a phone. Mitigation: emulate a
  touch device and scroll past the map.
- Tile requests reveal the precinct's area to OpenFreeMap (and Cloudflare). The precinct code
  is already in the URL and the county services see the point; `Referrer-Policy:
  no-referrer` keeps the page URL out of tile requests. Noted in the README.
- Chosen not to do: zoom buttons (MapLibre's control icons are `data:` SVGs in its CSS),
  popups, keyboard focus on markers, a "tap to interact" overlay (cooperative gestures cover
  it).

## Proof

- Criteria 1, 2, 4, 6, 7: `PrecinctMap.test.jsx` and `PollsCard.test.jsx` (mocked view),
  `mapBounds.test.js`; live drive shows the outline, dot and numbered markers matching the
  list, and the map removed when the tile host is blocked.
- Criterion 3: `build.test.js` chunk checks; live drive shows the map chunk requested only on
  `/p/...`.
- Criterion 5: live drive with touch emulation: the page scrolls past the map.
- Criterion 8: `render.test.js`; live drive under the real policy has no CSP errors.
- Criterion 9: existing `theme.test.js` and `build.test.js`.
