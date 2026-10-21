# Plan: Accessibility audit, WCAG 2.1 AA (issue #26)

Risk tier: Medium. Focus moves on navigation and a CI job that drives a real browser are
behavior unit tests cannot fully exercise, and the change alters existing pages across
several files. Nothing touches money, auth, data writes or outward messages.

Domain skills:
- superpowers:test-driven-development: invoke.
- chrome-devtools-mcp:a11y-debugging: not applicable because the audit drives Chromium
  through Playwright with axe-core and Lighthouse directly, which covers the same checks
  and is what CI will run.
- vercel-react-best-practices: not applicable because the changes are semantics and focus,
  not rendering performance.
- frontend-design: not applicable because the only visual addition is a skip link styled
  with the existing tokens.
- expo, django, django-ninja, fastapi, claude-api, dataviz: not applicable because none of
  those stacks are involved.

Mode: commit, under the repo CLAUDE.md git exception. The owner delegated plan approval and
low-stakes choices for this run.

## Audit before the change (production build, `vite preview`, live county services)

Chromium via Playwright at 320, 360, 375, 390, 412 and 1280 px; routes `/`, `/p/CC007`,
`/p/ZZ999` (not found), `/learn` (no topics), `/privacy`, `/nope`; plus the search flows
(suggestions, a St. Louis City address, a county address to results), share, and keyboard
navigation between pages.

- axe-core (wcag2a, wcag2aa, wcag21a, wcag21aa, best-practice): 0 violations on every
  route and state at both widths. Contrast passes (the app has one light theme; there is no
  dark mode to check).
- Lighthouse accessibility: 100 on every route, mobile and desktop.
- No horizontal scroll at 320 to 412 px, DPR 1, 2, 2.625 and 3, with and without classic
  scrollbars, on `/`, `/p/CC007`, `/p/ZZ999`, `/nope`. The 1px scroll noted in #44 does not
  reproduce on the production build.
- 640 px (200% zoom of 1280) and the WCAG 1.4.12 text spacing override: no overflow or
  clipped content.
- `prefers-reduced-motion`: no running animations; the skeleton pulse and map hint already
  turn off and the map camera never animates.
- Focus is visible (3px ink outline) on every tab stop; tab order follows reading order.
- Small targets: only inline links inside sentences (attribution and source lines), which
  the WCAG target size exception covers. Every standalone control is at least 44 px tall.

Defects found:
1. No skip link (issue checklist; landmarks alone already satisfy 2.4.1).
2. Following an in-app link to `/` (Search another address, Back to home) leaves focus on
   `<body>` and keeps the old scroll position (341 px down at 360 px wide). The same holds
   for the not-found page. Screen reader users hear nothing about the new page.
3. `/privacy` and the not-found page keep the generic tab title (2.4.2).
4. On `/p/<missing code>`, a St. Louis City result shows its notice heading as an `h2`,
   the same level as the "Search for your address" `h2` that contains it (1.3.1).
5. In forced colors (Windows High Contrast), the active address suggestion is marked only
   by a background color, which forced colors removes, so the keyboard position in the list
   is invisible.

Not fixed here: focus when the results fail to load (#18). Headings inside a folded topic
`<summary>` may be flattened by Safari and VoiceOver; it needs a real screen reader check.

## Acceptance criteria

1. Every page starts with a "Skip to main content" link, visible when focused, that moves
   focus to `<main>`.
2. After an in-app navigation (not the first load), the window is scrolled to the top and,
   when focus was left on `<body>` (or on `<main>`, where Safari puts it after a click),
   the page's `h1` takes focus. Back and Forward keep the scroll position the browser
   restores (revised after review).
3. `/privacy` has the tab title "Privacy | St. Louis County Voter Guide" and the not-found
   page "Page not found | St. Louis County Voter Guide" (including an unknown `/learn/<id>`,
   which renders the not-found page; its test is updated); each restores the previous title
   when it unmounts.
4. The out-of-county notice under "Search for your address" on a not-found precinct page
   uses an `h3`; on the home and not-found pages it stays `h2`.
5. The active suggestion has an outline in forced colors.
6. CI runs Playwright with axe-core against the production build (`vite preview`) on `/`,
   `/p/CC007`, `/p/ZZ999`, `/learn`, `/privacy` and `/nope` at 360 px and 1280 px, with
   ArcGIS answered from the recorded fixtures and every other outside request blocked. It
   fails on any axe violation (WCAG 2.1 A and AA plus best practice), on horizontal scroll,
   on a page without exactly one `h1`, without `lang`, or without the skip link as the first
   tab stop, and on navigation to home that leaves focus on `<body>`.
7. The gate (lint, format check, tests, build) passes, and Lighthouse accessibility stays
   at 100 on every route.
8. Items only a human can confirm (VoiceOver on iOS, TalkBack, NVDA, real browser zoom,
   Windows High Contrast) are listed on the issue, and the PR says `Refs #26`.

## Files that change

- `src/App.jsx`: skip link, `id="main"` and `tabIndex={-1}` on `<main>`, focus and scroll
  on navigation.
- `src/components/usePageTitle.js` (new): sets "<name> | St. Louis County Voter Guide" and
  restores the old title.
- `src/components/NotFoundPage.jsx`: `usePageTitle`, `tabIndex={-1}` on the `h1`.
- `src/features/lookup/HomePage.jsx`: `tabIndex={-1}` on the `h1`.
- `src/features/privacy/PrivacyPage.jsx`: `usePageTitle(copy.heading)` (no edit to
  `privacyCopy.js`, which #58 owns).
- `src/features/lookup/OutOfCountyNotice.jsx`: `headingLevel` prop (2 or 3).
- `src/features/lookup/AddressLookup.jsx`: passes `noticeHeadingLevel` through (UI only,
  no change to the geocoder wiring).
- `src/features/lookup/PrecinctPage.jsx`: passes 3 under "Search for your address".
- `src/features/lookup/AddressSearch.jsx`: forced-colors outline on the active option
  (class only).
- Tests: `src/App.test.jsx`, `OutOfCountyNotice.test.jsx`, `AddressLookup.test.jsx`,
  `PrecinctPage.test.jsx`, `AddressSearch.test.jsx`, `LearnTopicPage.test.jsx` (an unknown
  topic now has the not-found title), and a new `src/test/a11yPages.test.jsx` with axe on
  home, not found and privacy in jsdom.
- `e2e/a11y.e2e.js`, `playwright.config.js` (new), `package.json` (`@playwright/test`,
  `@axe-core/playwright`, `test:e2e` script), `.github/workflows/ci.yml` (install Chromium,
  run e2e after build), `eslint.config.js` (node globals for `e2e/`), `.gitignore` and
  `.prettierignore` (Playwright output).
- `README.md`: the e2e command and what it checks; the manual checks before each election.

## Order of work

1. Plan commit.
2. Red tests for criteria 1 to 5, then the fixes, one commit each where practical.
3. Playwright config, the e2e spec and the CI step; run it locally against `npm run build`
   and `vite preview`.
4. README.
5. Full gate, live audit again with the same scripts, Lighthouse.

## Risks

- Focus on navigation could steal focus from a page that sets its own (results, learn,
  privacy). Mitigation: only when focus is on `<body>`; child effects run before the App
  effect, so a page that focused its own heading is left alone.
- StrictMode runs effects twice in dev; comparing the previous location in a ref keeps the
  first load from counting as a navigation.
- Skip link `href="#main"` changes the hash; wouter's path ignores the hash, so the route
  does not change.
- Playwright in CI adds a Chromium download (about 1 minute). Outside requests are blocked
  so live outages cannot fail a PR, matching the data health rule.
- Vitest must not pick up the e2e spec: it is named `*.e2e.js` and lives outside `src`.

## Proof

- Criterion 1, 2: `src/App.test.jsx` (skip link first, focus moves to `main`; navigating to
  `/` focuses the `h1` and scrolls to top; first load does not move focus). E2E checks the
  first tab stop and focus after navigation in Chromium.
- Criterion 3: page tests for the titles.
- Criterion 4: `OutOfCountyNotice.test.jsx` (level 3), `AddressLookup.test.jsx` (h2 by
  default, h3 when asked) and `PrecinctPage.test.jsx` (the notice under the search is an
  `h3`).
- Criterion 5: `AddressSearch.test.jsx` asserts the forced-colors classes; the live drive
  emulates forced colors and checks the computed outline.
- Criterion 6: `npx playwright test` passes locally and in CI; a deliberate violation
  (temporary local edit, not committed) makes it fail.
- Criterion 7: gate output; Lighthouse rerun on the preview.
- Live drive: rerun the audit scripts against the new production build.
