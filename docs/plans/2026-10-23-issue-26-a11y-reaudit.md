# Plan: Accessibility re-audit, WCAG 2.1 AA (issue #26)

Risk tier: Medium. Touch target sizes and an overlay's contrast are layout and rendering
behavior a unit test in jsdom cannot fully exercise, and the change spans the topic pages,
the map stylesheet and the e2e suite. Nothing touches money, auth, data writes or outward
messages.

Domain skills:
- superpowers:test-driven-development: invoke.
- chrome-devtools-mcp:a11y-debugging: invoke (keyboard walkthrough, accessibility tree,
  live regions on the live preview).
- frontend-design: not applicable because the fixes are sizes and one alpha value with
  the existing tokens; design work belongs to #78 and #76.
- vercel-react-best-practices: not applicable because nothing changes rendering cost.
- expo, django, django-ninja, fastapi, claude-api, dataviz: not applicable because none of
  those stacks are involved.

Mode: commit, under the repo CLAUDE.md git exception. The coordinator delegated plan
approval and low-stakes choices for this run. The first pass of #26 was PR #62 (plan
`2026-10-21-issue-26-accessibility-audit-wcag-2-1-aa.md`); since then the app gained the
City pages, the wait times page and its map, Election Day line counts, topics and the
answer-first results page (#81). This run audits all of it again.

## Audit before the change (production build, `vite preview`)

Chromium via Playwright at 360 and 1280 px with the recorded fixtures, on `/`,
`/p/CC007` and `/p/W01P12` (early voting and Election Day), `/p/ZZ999`, `/early-voting`
(early voting with the map open and its Jenks legend, and Election Day), `/learn`, every
topic under `/learn/<id>`, `/privacy`, `/nope` and `/learn/nope`, with every `details`
opened and the page scrolled so the maps load. Plus a keyboard walkthrough on the live
preview in Chrome (search by keyboard, results, share, disclosures, the map toggle).

- axe-core (WCAG 2.1 A and AA plus best practice): 0 violations on every route and state.
  Its only "needs review" items are the map markers' numbers (over the map canvas); their
  colors are already checked in `mapColors.test.js`.
- Lighthouse accessibility (mobile): 100 on `/`, `/p/CC007`, `/p/W01P12`,
  `/early-voting`, `/learn`, `/learn/voter-id`, `/privacy`, `/p/ZZ999`, `/nope`.
- Landmarks, one `h1`, `lang="en"`, skip link first, no skipped heading levels: pass on
  every route. Every tab stop shows the focus ring and is in view when focused.
- Reflow: no horizontal scroll at 320 px (400% zoom), at 640 px (200% of 1280) or with
  the WCAG 1.4.12 text spacing override, and no clipped text.
- Reduced motion: no running animation on any route; the skeleton pulse and the map
  gesture hint turn off, and the maps never animate the camera.
- Keyboard: search, pick a suggestion with the arrows, Enter goes to the results with
  focus on the `h1` and "Results for precinct ... are ready" announced; Share announces
  "Link copied."; the disclosures and "Hide map" (with `aria-expanded`) work by keyboard.

Defects found:
1. Topic pages: a folded section's summary (its `h2`) is a 28 px tall tap target, under
   the 44 px the issue asks for, on every topic with a long section, at both widths. The
   results page's own disclosures are already 44 px.
2. Topic pages: each link in the Sources list is a standalone 22 px tall target.
3. The maps' gesture hint ("Use Ctrl + scroll to zoom the map", 18 px text) is surface
   text on ink at 60% over the map. Over the basemap's white roads that is about 4.4:1,
   under the 4.5:1 that normal-size text needs (1.4.3).

Noted, not changed here:
- Citation markers `[1]` in topic text are 15 x 17 px. They sit inside sentences, which
  the target size criteria exempt; a larger hit area is design work for #78.
- Source and credit links inside sentences ("Sources: A, B", "Map: OpenFreeMap, ...")
  are inline, also exempt.
- The results summary's headings are uppercase by CSS, and Chrome exposes the uppercase
  text. Real screen readers may spell short uppercase words; added to #27's real-device
  list rather than changed blind.
- MapLibre's canvas is a tab stop named "Map" (keyboard pan and zoom). It is inside the
  labeled map region and its markers are hidden; left as is.
- Real screen readers (VoiceOver iOS, TalkBack, NVDA) and desktop browser zoom: owner
  steps, listed on #27. Dark mode contrast: #77 (no dark theme yet).

## Acceptance criteria

1. A folded topic section's summary is at least 44 px tall.
2. Each link in a topic's Sources list is at least 44 px tall.
3. The gesture hint's text is at least 4.5:1 against its backdrop over white, the
   lightest thing on the basemap, checked by a unit test from the CSS and the tokens.
4. `e2e/a11y.e2e.js` fails when a standalone control (link, button, summary, form
   control) on any covered route is under 44 px tall, with links inside a sentence or
   a comma list exempt, and the skip link exempt while hidden.
5. `e2e/a11y.e2e.js` covers the routes and states it missed: the City precinct on
   Election Day with its map, a topic with City sections (`/learn/who-to-contact`),
   `/learn/nope`, and `/early-voting` with the map hidden.
6. The gate (lint, format check, tests, build, e2e, perf) passes; results pages' LCP does
   not regress (about 2.41 to 2.42 s before).
7. README's Accessibility section says what the e2e run now checks.

## Files that change

- `src/features/learn/TopicArticle.jsx`: summary `min-h-11 py-2`, sources list links
  `inline-flex min-h-11 items-center`.
- `src/features/lookup/precinctMap.css`: gesture hint backdrop 75% ink.
- `src/features/lookup/gestureHint.test.js` (new): the contrast check.
- `e2e/a11y.e2e.js`: target size test per route, new routes and states.
- `README.md`: Accessibility section.

## Order of work

1. Plan commit.
2. Red: the e2e target size check and the new routes; run, see 1 and 2 fail. Red: the
   gesture hint contrast unit test fails at 60%.
3. Fixes, one commit each.
4. README.
5. Full gate, the audit scripts again, Lighthouse.

## Risks

- A target size check that is too strict flags inline links and becomes noise; the
  exemption is "the link's nearest block holds other text", matching the WCAG inline
  exception.
- Taller source links lengthen the topic pages a little; nothing on the results pages
  changes, so their LCP cannot move.
- The new routes add e2e time (about 4 x 2 widths x 4 checks).

## Proof

- Criteria 1, 2, 4: the target size test fails before the fix on `/learn/voter-id` and
  `/learn/who-to-contact`, passes after.
- Criterion 3: `gestureHint.test.js` fails at 60% and passes at 75%.
- Criterion 5: the new describe blocks in the e2e run.
- Criterion 6: gate output, `npm run test:perf` output.
- Live drive: rerun the audit scripts against the new build; check a topic page's summary
  and sources at 360 px.
