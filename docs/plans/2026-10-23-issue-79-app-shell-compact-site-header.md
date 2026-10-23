# Plan: App shell, compact site header and cleaner footer on every page (issue #79)

Risk tier: Medium. A new component on every page plus a change to how focus moves after an
in-app link (interaction a unit test only partly exercises); several files, no data, API or
security surface.

Domain skills: superpowers:test-driven-development, invoke; frontend-design:frontend-design,
invoke (new visible chrome and an icon); vercel-react-best-practices, invoke (React component,
hydration of pre-rendered pages); chrome-devtools-mcp:a11y-debugging, not applicable because
the Playwright e2e suite (axe, touch targets, reflow, skip link) runs the same checks in a real
browser and is extended here; superpowers:systematic-debugging, not applicable (no bug).

Scope notes from the coordinator: #78 (shared Button, Link, Card, Notice) comes later, so the
header's styling stays local and small. #71's footer copy is not rewritten. The header must stay
compact and static so it never becomes a late-painting LCP element (#27, PR #178).

## Acceptance criteria

1. Every route, including the error screen and not found, shows the site header: a `banner`
   landmark above `main`.
2. The header holds the site name with a small SVG mark (`currentColor`, no red or blue),
   linking home, and a `nav` with an accessible name holding "Look up" (home) and "How to
   vote" (`/learn`). The current page's link has `aria-current="page"`.
3. At 360 px the header is one row, at most 56 px tall, and causes no horizontal scroll, also
   with the WCAG text spacing override. No hamburger menu. Every header link is at least 44 px
   tall.
4. The skip link stays the first tab stop and still moves focus to `main`.
5. Following a header link to another page moves focus to the new page's `h1`, as following an
   in-page link does (the header link stays on screen, so today's rule would leave focus on it).
6. The header is not sticky, and is hidden in print.
7. The footer keeps Privacy and #71's nonpartisan, unofficial statement naming both boards,
   with a layout matching the header (full-width rule, content in the same column).
8. A favicon and an Apple touch icon (180 px PNG) in the same mark and the palette's primary
   color, at the root paths browsers request on their own (`/favicon.ico`,
   `/apple-touch-icon.png`), so every page, pre-rendered or the shell, gets them. Revised
   during the work: the plan first linked `/favicon.svg` from `index.html`; a linked icon and
   the root `/favicon.ico` cost the same in Lighthouse (one more early request, about 150 ms of
   simulated LCP on the results pages), so the simpler root-path form was kept, with
   `public/favicon.svg` as the source mark.
9. Lighthouse budgets (`npm run test:perf`) still pass; the header causes no layout shift (it is
   in the pre-rendered markup and in the shell's first render, with fixed height).

## Files that change

- `src/components/SiteHeader.jsx` (new), `src/components/siteHeaderCopy.js` (new),
  `src/components/SiteMark.jsx` (new, the SVG mark), `src/components/SiteHeader.test.jsx` (new).
- `src/i18n/en.json`: a `header` group (nav label, Look up, How to vote).
- `src/App.jsx`: render `SiteHeader` after the skip link, before `main`; `usePageArrival` also
  moves focus when it was on a link inside the site header.
- `src/App.test.jsx`, `src/AppErrorBoundary.test.jsx`: header on every route and on the error
  screen; focus after a header link.
- `src/components/SiteFooter.jsx`: full-width top rule, content in the same centered column.
- `public/favicon.svg`, `public/favicon.ico` (16, 32, 48 px), `public/apple-touch-icon.png`
  (new). `index.html` is unchanged.
- `src/test/build.test.js`: the icons ship at the root, colors of the mark are not red or blue,
  and no page links an icon.
- `e2e/a11y.e2e.js`: the existing "How to vote" click scoped to `main` (the header now has a
  link with the same name); a per-route check that the banner is shown and at most 56 px tall,
  also with the text spacing override.
- `src/prerender/plugin.js`: a comment that said the Lighthouse run loads no extra file (the
  icons now load); `src/test/render.test.js`: the icon paths join the header rule probes.
- `README.md` (Phase 8): mention the header where the page rules and print rules are described,
  if a line there becomes wrong.

## Order of work

1. Red unit tests for `SiteHeader` (landmark, nav name, links, `aria-current`, print class).
2. `SiteHeader`, `SiteMark`, copy; green.
3. Red App tests: header on every route and the error screen, focus after a header link; then
   App changes; green.
4. Footer layout tweak (existing footer tests stay green).
5. Icons and `index.html` links; check `dist/` has them after the build.
6. e2e changes; full gate including `test:e2e` and `test:perf`.

## Risks

- Strict-mode locator clashes: `getByRole('link', { name: 'How to vote' })` now matches two
  links on the home page. Scope existing selectors rather than renaming copy.
- Width at 360 px: site name plus two links may not fit with the text spacing override. If not,
  "Look up" shows from `sm` up only (the site name already links home); that matches the issue's
  "on wider screens" wording.
- Hydration: the header reads the location for `aria-current`; the server render passes
  `ssrPath`, so markup matches. The pre-rendered `/learn` also hydrates at `/learn/`, so the
  comparison normalizes the path (trailing slash, case) as the routes do (finder 1).
- Measured at 360 px: with "Look up" shown, the site name and both links wrap inside the row
  under the text spacing override, so "Look up" shows from `sm` (640 px) up, as the issue's
  "on wider screens" allows.
- LCP: the header text is small; the largest element stays each page's own content. Measured:
  the header alone leaves every route's LCP as on main (results pages about 2.42 s). Any
  favicon adds one early request that Lighthouse's simulation counts, about 150 ms on the
  results pages, past the 2.5 s budget on main as it stands. PR #178 (#27) brings those pages
  to about 1.5 s; this branch is rebased on it and merged only with `npm run test:perf` green.

Not chosen: a sticky header (issue says not by default; noted in the PR for review), a
`favicon.ico` (modern browsers use the SVG), and the PWA manifest icons (#25 owns them; the mark
in `public/favicon.svg` is the source for those sizes).

## Proof

- `src/components/SiteHeader.test.jsx`: criteria 2, 6.
- `src/App.test.jsx`, `src/AppErrorBoundary.test.jsx`: criteria 1, 5.
- `e2e/a11y.e2e.js` per route at 360 and 1280 px: criteria 1, 3, 4 (skip link test exists).
- `src/test/build.test.js` ("ships the icons at the root paths"): criterion 8.
- `npm run test:perf`: criterion 9.
- Live drive: build and preview, open `/`, `/p/CC007` and `/nope` at 360 px, tab from the top,
  follow both header links, check focus lands on each page's `h1`.
