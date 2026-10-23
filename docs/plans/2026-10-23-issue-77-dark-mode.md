# Plan: Dark mode that follows the system setting, including the map (issue #77)

Risk tier: High. Stateful UI a unit test cannot fully exercise (the maps switch style when
the scheme changes), it alters every page's look and the maps' existing setup, and it touches
more than a few files. No payments, auth, data or outward messages.
Plan approval: run autonomously under the coordinator's brief for #77 (dark values on the
#76 tokens, contrast test for both themes, readable blue-free dark basemap, no LCP or JS
budget regression, screenshots in the PR); no interactive pause was available.

Domain skills:
- superpowers:test-driven-development: invoke.
- dataviz: invoke (the wait time ramp and legend on a dark basemap; dark mode chosen, not flipped).
- frontend-design: not applicable because the palette direction is fixed by #76; this
  issue picks dark steps of the same tokens and is checked by computed contrast.
- vercel-react-best-practices: not applicable because no React component changes shape;
  the change is CSS tokens and the two MapLibre view modules.
- chrome-devtools a11y-debugging: not applicable because `e2e/a11y.e2e.js` runs axe in
  Chromium, now in both schemes.

## Acceptance criteria

1. With the OS in dark mode, every route renders the dark theme with no light flash after
   first paint: the dark values are in the render-blocking stylesheet, `html` itself paints
   `surface`, and `<meta name="color-scheme" content="light dark">` makes the canvas dark
   before the stylesheet arrives.
2. Every `--color-*` token from #76 has a dark value in `src/index.css`, under
   `@media screen and (prefers-color-scheme: dark)` on `:root`, still oklch and never red or
   blue (the theme guard reads every declaration).
3. `src/test/contrast.test.js` checks every pair for both themes (light from `@theme`, dark
   from the dark block over it); the brand-hue and near-gray checks run for both.
4. `color-scheme: light dark` on `:root` (light only in print).
5. Two `<meta name="theme-color">`, one per scheme with a `media` attribute, each its
   theme's `surface` as hex; `theme.test.js` checks both.
6. Both maps use OpenFreeMap's `dark` style in dark mode and Positron in light, read their
   token colors at each style load, and switch style and colors when the scheme changes.
   The dark style is on `tiles.openfreemap.org` with the same sprite and glyph hosts, so the
   CSP is unchanged. Its colors are all grays; every label is still drawn in `muted`.
7. The wait ramp, its legend and the precinct outline stay readable and distinguishable on
   the dark basemap, with no red or blue: `mapColors.test.js` and `gestureHint.test.js` run
   for both themes against each basemap's land (Positron and dark). Marker numbers use fixed
   tokens so they stay 4.5:1 on their fill whatever the theme.
8. Print stays light regardless of scheme. The map canvas cannot switch basemap in time for
   a print, so with the system dark the map regions are left out of print
   (`print:dark:hidden`); the lists hold everything on them.
9. No manual toggle and no storage.
10. axe passes for both schemes: every route in `e2e/a11y.e2e.js` also runs axe with
    `colorScheme: 'dark'`. `BLANK_STYLE` answers both style URLs.
11. Lighthouse budgets and the 120 KB first-load JS budget still pass; no budget loosened.

## Files that change

- `src/index.css`: dark token block, `color-scheme`, `html` background, new
  `--color-wait-number-light` / `--color-wait-number-dark` tokens, dark shadow.
- `index.html`: color-scheme meta, two theme-color metas.
- `src/features/lookup/basemap.js`: `BASEMAP_DARK_STYLE_URL` (the e2e fixtures tell the
  two styles apart with `isBasemapStyle`).
- `src/features/lookup/mapStyle.js`: `DARK_SCHEME` query, `basemapStyleUrl()`,
  `watchColorScheme()`, `followColorScheme(map)`, which fetches the new style first and sets
  it only once it arrived, so a failed request (offline) keeps the drawn basemap.
- `src/features/lookup/PrecinctMap.jsx`, `src/features/waitTimes/WaitTimesMap.jsx`:
  `print:dark:hidden` on the map region.
- `src/features/lookup/precinctMap.css`: the gesture hint comment.
- `src/features/lookup/precinctMapView.js`, `src/features/waitTimes/waitTimesMapView.js`:
  pick the style by scheme, set up layers on every `style.load`, `setStyle` on change,
  unsubscribe on remove or failure.
- `src/features/waitTimes/waitColors.js`: marker numbers on the fixed number tokens.
- Tests: `src/test/colors.js` (`themeTokens`), `contrast.test.js`, `theme.test.js`,
  `mapColors.test.js`, `gestureHint.test.js`, new `src/features/lookup/mapStyle.test.js`,
  `render.test.js` (both styles on the allowed origin).
- `e2e/a11y.e2e.js`, `e2e/lighthouse.js`, `e2e/fixtures.js`: blank style for both URLs, dark
  axe run, dark first-paint check, map style switch check, print stays light.
- Docs: `README.md` (Colors, Map), `docs/data.md` (Basemap).

## Order of work

1. Tests first: `themeTokens` and the dual-theme contrast, theme-color, map color and
   gesture hint tests (red), then the CSS and HTML (green).
2. `mapStyle.test.js` for `basemapStyleUrl` / `watchColorScheme` (red), then the helpers.
3. Map views switch style; update `mapColors.test.js`'s outline lookup.
4. e2e: blank style for both URLs, dark axe pass, first paint and print checks.
5. Docs.

## Risks

- A token missing a dark value silently stays light: the contrast test reads the merged
  dark map, and a test asserts every light color token has a dark value.
- `setStyle` drops the precinct source and layers: they are added on every `style.load`.
- Theme switching while the map is still loading: style errors before the first render
  still drop the map, as before.
- Ink is light in dark mode, so the precinct outline (ink) nears the pale tan step: the
  dark `wait-3` is a shade deeper so the outline stays 0.15 OKLab from every step.
- LCP: no new request on first load; the CSS grows by about 1 KB.

## Revisions

- After review finder 1: fetch-first style switch (`setStyle` with a URL dropped the drawn
  basemap before the request could fail), maps left out of dark print, the dark shadow a
  plain oklch color (the build's color-mix fallback resolved the var() to its light value),
  `render.test.js` checks the dark style's origin, stale comments fixed.
- After review finder 2: tests that fail without the code they prove. A unit test of
  `precinctMapView.js` with MapLibre stubbed (the precinct is drawn again in the new colors
  on each `style.load`); e2e switch and offline tests read the map canvas's pixels against a
  tinted test style (`tintedStyle` in `e2e/fixtures.js`); the first-paint test requires the
  page itself to paint the surface; a dark-print test for the precinct map. The style fetch
  sends no cookies and no referrer, as the app's other requests.
- After review finder 4: a style load that already holds the precinct (MapLibre restoring a
  lost WebGL context) only recolors its layers instead of adding them again, which threw and
  dropped a still-loading map.

## Proof

- Criteria 2, 3, 7: `contrast.test.js`, `theme.test.js`, `mapColors.test.js`,
  `gestureHint.test.js`.
- Criterion 5: `theme.test.js`.
- Criterion 6: `mapStyle.test.js`, `render.test.js`; live drive in Chromium with the scheme
  emulated, switching while the map is shown.
- Criteria 1, 8, 10: `e2e/a11y.e2e.js`.
- Criterion 11: `npm run test:perf`, `build.test.js`.
- Live drive: screenshots at 360 and 1280 px in both schemes of home, a results page and
  `/early-voting` with the real dark basemap.
