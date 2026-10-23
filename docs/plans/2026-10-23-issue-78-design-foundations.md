# Plan: Design foundations: type scale, spacing and shared Button, Link, Card, Notice components (issue #78)

Risk tier: High. Not forced High (no money, auth, data or outward messages), but it starts
Low and rises for each of: stateful UI and focus behavior a unit test cannot fully exercise
(busy buttons, disclosures, focus rings), altering existing markup rather than adding, and far
more than a few files (about 35 across every route). Capped at High. The plan was not
separately approved by a human: this run was delegated by the coordinator, whose notes set
the bar (no change to what voters are told, no lost behavior, no regressions, mechanical
consolidation over visual reinvention).

Domain skills:
- superpowers:test-driven-development: invoke (component tests and the focus ring e2e check
  are written first and watched failing).
- frontend-design:frontend-design: invoke, bounded by the coordinator: existing oklch color
  tokens and the system font stack only, no palette change (#76 owns it), no new layout.
- vercel-react-best-practices: invoke (direct imports, no barrel file, nothing new in the
  first load beyond a few small components; the 120 KB budget is tight at about 117 KB).
- chrome-devtools-mcp:a11y-debugging: not applicable because `e2e/a11y.e2e.js` already runs
  axe, the 44 px target checks, reflow and focus at 360 and 1280 px on every route, and the
  live drive uses the same Playwright build.
- superpowers:subagent-driven-development: not used. The tasks edit the same files in
  sequence (each feature file swaps its strings for the components), so parallel subagents
  would conflict; the work is done inline and reviewed by fresh finders.

## Acceptance criteria

1. Tokens in `src/index.css` `@theme`: a type scale for 360 px (14, 16, 18, 22, 28 px with
   line heights: `text-sm`, `text-base`, `text-subheading`, `text-heading`, `text-title`),
   the 4 px spacing rhythm stated, two radii (`rounded-control`, `rounded-card`), and two
   shadows built from color tokens (`shadow-card`, `shadow-popover`). Notice colors are
   aliases of existing color tokens (`--color-notice-info`, `-warning`, `-danger`), so #76 can
   retune them. No palette value changes. The theme guard and palette tests still pass.
2. Shared components in `src/components/` (JavaScript, JSX):
   - `Button`: `primary`, `secondary`, `quiet` variants, `md` and `sm` sizes, a `busy`
     state (`aria-disabled`, a press while busy does nothing), renders a `button`, an `a`
     (`href`) or a wouter `Link` (`to`). `RetryButton` uses it.
   - `TextLink`: internal (`to`, wouter `Link`) and plain (`href`, `a`) links, with `inline`
     (default), `tap` (44 px box), `row` (full-width tappable row) and `nav` (site header)
     looks. The external-link icon is not built (no caller needs it; noted in the PR).
   - `Card`: the results `Card` generalized, with title, optional summary line and body;
     `CARD` and `CARD_EMPHASIS` box classes for placeholders and the results summary.
   - `Notice`: `info`, `warning`, `danger`; used by every `role="alert"` error message,
     `OutOfCountyNotice` and `PrecinctStatusBanner`. An always-present live region keeps its
     element and holds the Notice only while it has text, so announcements do not change.
   - `Disclosure`: moved from `src/features/lookup/` to `src/components/`, also used for the
     City site's own hours (CityEarlyVotingCard). Topic sections in `TopicArticle` keep their
     own `details` (their heading is the summary and LearnTopicPage opens them for print).
3. Every interactive component keeps the 44 px minimum (`min-h-11`).
4. Programmatically focused headings (`h1`, `h2`, `h3` with `tabindex="-1"`) draw no focus
   ring; everything interactive keeps it. An e2e check proves the focused `h1` has no outline
   after an in-app keyboard navigation, and that a link still has one.
5. No feature file defines its own link or button class string (`linkClass`,
   `tapLinkClass`, `buttonClass`, `rowClass`, `navLink`, `directionsClass`, `BUTTON`). The
   `linkClass` props of `CountyElectionDayRule`, `CityElectionDayRule` and `OfficialLookups`
   go away. A unit test greps `src/features` and `src/components` for those names.
6. Learn, topic, Privacy and not found pages use the components.
7. Topic citation markers `[1]` get a taller hit area without changing the line layout
   (vertical padding only, still inline so WCAG exempts them). Revised after finder 1:
   horizontal padding offset by a negative margin made a run like `[1][2]` overlap, so a tap
   on the end of `[1]` opened source 2.
8. README gets a short "UI" section: which component to use for what.
9. All existing unit and e2e tests pass with only selector updates where markup changed.
   First load JavaScript stays under 120 KB gzipped, no web font. Lighthouse budgets pass
   with no budget loosened; the 600 ms fixture wait and the no-move tests are untouched.
10. Screenshots at 360 px and 1280 px of every route are attached to the PR.

## Files that change

- `src/index.css`: tokens; heading focus rule.
- `src/i18n/LanguageSwitcher.jsx`: `rounded-control` (same radius).
- New: `src/components/Button.jsx`, `buttonClass.js`, `TextLink.jsx`, `Card.jsx`, `Notice.jsx`,
  `Disclosure.jsx` (moved), tests `src/components/{Button,TextLink,Card,Notice}.test.jsx`,
  `src/test/sharedStyles.test.js` (no local class strings).
- Removed: `src/features/lookup/Disclosure.jsx` (moved).
- `src/features/lookup/RetryButton.jsx` (wraps Button).
- Feature files swapping strings for components: `App.jsx` (wait times fallback heading
  size only), `components/{ErrorBoundary,NotFoundPage,OfficialLookups,SiteFooter,SiteHeader}.jsx`,
  `features/lookup/{AddressLookup,AddressSearch,CityDistrictsCard,CityEarlyVotingCard,CityElectionDayRule,CitySampleBallotCard,CountyElectionDayRule,DistrictsCard,EarlyVotingCard,GeocoderAttribution,HomePage,OutOfCountyNotice,PollsCard,PrecinctMap,PrecinctPage,PrecinctStatusBanner,ResultsCards,ResultsSummary,SampleBallotCard,ShareLink,UseMyLocation}.jsx`,
  `features/learn/{LearnPage,LearnTopicPage,TopicArticle}.jsx`,
  `features/privacy/PrivacyPage.jsx`, `features/waitTimes/{WaitTimesMap,WaitTimesPage}.jsx`.
- Tests: selector updates only where markup changed (for example a `linkClass` prop test in
  `CountyElectionDayRule.test.jsx`).
- `e2e/a11y.e2e.js`: the focused heading check.
- `README.md`: UI section; Accessibility section notes the heading ring rule.

## Order of work

1. Tests first for Button, TextLink, Card, Notice, the no-local-strings test and the e2e focus
   check; watch them fail.
2. Tokens and the heading focus rule in `src/index.css`; the components.
3. Swap each feature file over, page by page (results page first: the highest traffic),
   running the unit tests after each group.
4. Headings onto the type scale: `text-title font-bold` for every `h1` (and the wait times
   loading fallback in `App.jsx`, which must match), `text-heading` for section `h2`s,
   `text-subheading` for the address label.
5. Full gate: lint, format check, unit tests, build, e2e, Lighthouse.
6. README.

## Risks

- Layout shift on the results page (#27, #156): the skeleton and the loaded page share the
  summary parts, Card box and button heights. Every placeholder keeps its height class; the
  results `h1` grows from 24 to 28 px on phones, in both the loading and loaded states, so it
  does not move between them. The no-move e2e test and the pinned-clock LCP checks prove it.
- Home page above the fold at 360 x 640 (#80): the `h1` shrinks from 30 to 28 px; the e2e
  assertion proves it still fits.
- Live regions: a `role="alert"` paragraph that is always mounted keeps its element; only the
  box inside it is conditional. Elements change from `p` to `div` where a Notice `p` now sits
  inside, so unit tests that look for the alert by role still pass.
- Busy buttons: `Button` guards only its `onClick` while busy, so a submit button's form
  still runs its own busy check (AddressSearch), unchanged.
- Bundle: five small components in the first load; duplicate strings go away. The build test
  proves the budget.
- Small visual changes are deliberate and listed in the PR: headings on the scale, 8 px card
  radius with a faint shadow, error messages in a danger Notice box, secondary buttons all
  with the 2 px border and surface fill "Use my location" already had (so the summary's
  directions button gets a surface fill on the raised summary box), the filename line of the
  sample ballot button keeps its normal weight, the results `h1` is 28 px on every width (it
  was 24 on phones and 30 from the `sm` breakpoint), and the address suggestions list uses
  `shadow-popover` instead of Tailwind's `shadow-md`.
- Form fields (the address box, the share field, the language select) take `rounded-control`,
  the same 6 px as the `rounded-md` they had: the token only, no new look.

Not done here: palette changes (#76), the external-link icon, the skip link's own classes in
`App.jsx` (it is visually hidden until focused, with its own positioning), a shared form
field component (inputs and the language select are not links or buttons; they only take the
radius token).

## Proof

- Criterion 1: `theme.test.js`, `palette.test.js`, build CSS checks; Card test asserts the
  token classes.
- 2, 3: component unit tests (variants, busy guard, element per prop, `min-h-11`).
- 4: new e2e test in `e2e/a11y.e2e.js`; it fails on main's CSS.
- 5: `src/test/sharedStyles.test.js`, failing before the swap.
- 6, 7: unit tests of those pages still pass; the e2e target checks pass on `/learn/*`.
- 9: `npm test`, `npm run build`, `npm run test:e2e`, `npm run test:perf`.
- Live drive: built preview at 360 and 1280 px on every route (`/`, `/p/CC007`, `/p/W01P12`,
  `/early-voting`, `/learn`, `/learn/voter-id`, `/privacy`, a not found path), screenshots,
  plus an error state (blocked ArcGIS) to see the danger Notice and Try again, and keyboard
  navigation to see the heading without a ring and links with one.
