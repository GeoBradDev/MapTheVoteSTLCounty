# Plan: Re-evaluate the color palette, one brand hue, neutral grays and nonpartisan semantic colors (issue #76)

Risk tier: Medium. Styling only (no data, auth or outward messages), but it alters every page's
look, touches more than a few files, and the visual result is only partly provable by unit
tests (axe in Playwright and the contrast test cover the rest).

Domain skills: frontend-design, invoke (palette and notice design); vercel-react-best-practices,
invoke (React components, first-load bundle budget); chrome-devtools-mcp:a11y-debugging,
invoke (contrast, forced colors); superpowers:test-driven-development, invoke; dataviz, invoke
only for the map check (wait ramp vs. brand teal); django, django-ninja-api, python-fastapi,
expo and React Native skills, not applicable because this is a Vite React web app with no
backend; artifact skills, not applicable because nothing is published.

Owner decisions already made: brand hue deep teal, about 185 (comment on #76). The focus ring
stays on script-focused error areas and retried cards (#78). The manifest stays with #25.

## Acceptance criteria

1. No color token is red or blue: the existing guards (`theme.test.js`, `build.test.js`) pass.
2. A new unit test computes WCAG contrast for every required pair and passes: `ink` and `muted`
   on each surface (4.5:1), `primary` on each surface (4.5:1), `on-primary` on `primary`,
   `primary-hover` and `primary-pressed` (4.5:1), each semantic `*-ink` on its `*-fill` and on
   `surface` (4.5:1), `ink` and `muted` on each `*-fill` (4.5:1), and `border-strong` on each
   surface (3:1).
3. The brand hue is teal near 185 (180 to 195), and the neutrals have chroma at or under 0.012.
4. Every `Notice` (every `role="alert"` error, the out-of-county notice, the precinct status
   banner) and the slow-network notice (#18) is set apart without color alone: a tinted fill, a
   4 px edge in its kind's ink (at least 3:1 on the fill and on `surface`), and an icon (SVG,
   `currentColor`, `aria-hidden`) per kind. In forced colors the edge and icon remain.
5. Secondary-looking buttons (`quiet`: Share this page, Show more) and full-width link rows
   have a `border-strong` boundary (3:1).
6. The primary button has hover and pressed states from `primary-hover` and `primary-pressed`;
   the secondary and quiet buttons fill with `surface-raised` on hover.
7. `index.html` has `<meta name="theme-color">` equal to the `surface` token as hex; a test
   reads it, checks `partyColor` is null and that it equals `surface` converted to sRGB hex.
8. The site icons (`favicon.svg`, `favicon.ico`, `apple-touch-icon.png`) are redrawn in the new
   `primary` and `on-primary` (README rule).
9. The precinct map's outline cannot be read as a line-count class: the new brand teal is about
   0.03 OKLab from `wait-1` (the shortest-line step), so the outline and its fill draw in `ink`
   instead of `primary`, its fill at 10% (was 15%, since ink is darker than the teal).
10. README "Colors" lists the tokens and the semantic color rule; README "Map" says what the
    outline uses.
11. `npm run lint`, `format:check`, `npm test`, `build`, `test:e2e` (axe, no contrast issues at
    360 and 1280 px) and `test:perf` pass; first-load JS stays under the unchanged 120 KB budget.

## Files that change

- `src/index.css`: rewrite the color part of `@theme`: neutrals (`surface`, `surface-raised`,
  `surface-sunken`, `border`, `border-strong`, `ink`, `muted`), brand (`primary`,
  `primary-hover`, `primary-pressed`, `on-primary`), semantic pairs (`info-*`, `warning-*`,
  `danger-*`, `success-*` as `-fill` and `-ink`), each with its role and minimum contrast.
  Remove `accent`, `on-accent` and the `notice-*` aliases. Wait ramp unchanged.
- `src/test/colors.js`: add `contrastRatio(a, b)` for oklch literals (oklch to sRGB math).
- `src/test/contrast.test.js` (new): criteria 2 and 3.
- `src/components/Notice.jsx` and test: per-kind fill, edge, icon; add `success` kind.
- `src/components/NoticeIcon.jsx` (new) or icons inline in Notice: four small SVGs.
- `src/components/buttonClass.js`, `Button.test.jsx`: `quiet` uses `border-border-strong`;
  primary hover and pressed.
- `src/components/TextLink.jsx` (+ test if it asserts the row's border): row uses
  `border-border-strong`.
- `src/features/lookup/HomePage.jsx`: the election date pill moves off `accent` to
  `bg-info-fill text-info-ink`.
- `src/features/lookup/AddressLookup.jsx`, `PrecinctPage.jsx`: the slow notice renders as an
  info `Notice` inside its kept `role="status"` region.
- `src/features/lookup/precinctMapView.js`: outline and fill read `--color-ink`.
- `src/test/tokens.test.js`: new utilities replace the `notice-*` ones; the alias test goes.
- `index.html`: theme-color meta; a test for it (in `src/test/theme.test.js` or a new
  `themeColor.test.js`).
- `public/favicon.svg`, `public/favicon.ico`, `public/apple-touch-icon.png`: redrawn.
- `README.md`: Colors and Map sections.

## Order of work

1. Contrast helper and failing contrast test (red: tokens missing), then the `@theme` rewrite.
2. Notice: test for fill, edge and icon per kind, then the component.
3. Buttons, link rows, pill, slow notices, map outline, each with its test updates.
4. theme-color meta and its test; redraw the icons (render the SVG with Playwright's Chromium,
   pack the ICO with Pillow).
5. README.
6. Full gate, before and after screenshots at 360 and 1280 px.

## Risks

- LCP: the slow notice appears after 3 s, so it should never be in the measured window; the
  Notice icons add a few hundred bytes of JS to the first load (budget headroom about 3.8 KB).
- Tests asserting exact classes (`border-notice-*`, `border-border`) need updating; any that
  assert on Notice text use `textContent`, which the icon (no text) does not change.
- Built CSS may write hex fallbacks for oklch; the build guard converts them, so out-of-gamut
  tokens are avoided (every token is inside sRGB).
- The danger ink (hue 50) and the wait ramp's brown (hue 55) are close; they never appear in
  the same component, and the danger notice carries its icon.

Not done: no `sr-only` "Error:" prefix on alerts (the messages already say what failed, and the
announced text would change); the manifest (#25); no change to the wait ramp.

## Proof

- Criteria 1 to 3: `theme.test.js`, `build.test.js`, new `contrast.test.js`.
- Criterion 4: `Notice.test.jsx` (fill, edge, icon per kind); slow-notice tests in
  `AddressLookup.errors18.test.jsx` and `PrecinctPage.errors18.test.jsx` still find the text;
  forced colors checked by hand in Chromium emulation.
- Criteria 5, 6: `Button.test.jsx`, `TextLink.test.jsx`, `tokens.test.js` (the utilities
  compile from tokens).
- Criterion 7: the theme-color test. Criterion 8: `build.test.js` icon check plus a look.
- Criterion 9: `precinctMapView` test if one asserts the color, else the live drive.
- Criterion 11: the gate output; live drive at 360 and 1280 px shows home, a results page
  with the status banner, an error notice and the wait times map legend.
