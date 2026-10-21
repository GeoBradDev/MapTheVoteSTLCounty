# Plan: Results screen shell and precinct status (issue #11)

Risk tier: Medium. Stateful async UI (loading, error, focus and live-region announcements)
that unit tests can only simulate, and it replaces the existing `/p/:precinct` placeholder
rather than adding beside it. It touches no auth, money, data writes or outward messages.

Domain skills:
- superpowers:test-driven-development: invoke.
- vercel-react-best-practices: invoke for the page and card components.
- chrome-devtools-mcp (a11y-debugging, chrome-devtools): invoke for the live drive (focus,
  live region, skeleton).
- frontend-design: not applicable because the cards use the existing token classes and the
  card contents are later issues (#12, #14, #15, #16).
- context7: not applicable because only wouter and React Testing Library APIs already in use
  are needed.
- expo, django, django-ninja, fastapi, claude-api, dataviz: not applicable because none of
  those stacks are involved.

Mode: no-commit. The repo has no CLAUDE.md or AGENTS.md git exception and the user's global
instructions forbid commits, so the files stay uncommitted for the owner to ship.

## Acceptance criteria

1. `/p/:precinct` loads the precinct with `getPrecinctById` (#5). Only the precinct code is
   in the URL; the lookup already navigates there (#10).
2. While loading, the page shows the heading "Precinct <code>" and skeleton placeholders for
   the municipality line and the four cards. The skeletons are `aria-hidden`, and their pulse
   stops under `prefers-reduced-motion`.
3. When loaded, the header shows the precinct code (in the `h1`), the municipality
   (`Unincorporated` shown as "Unincorporated St. Louis County"; no line when empty), and a
   "Search another address" link to `/`.
4. Status banner from `in_election`:
   - `In Election`: no banner.
   - `Nonresidential Precinct`: the county's message from `html`, read with
     `parseSampleBallot` (#6) and shown as plain text; when the field gives no message, a
     fallback line that names the status and links the county election board's site. The
     sample ballot card is hidden.
   - `Not In Election`: says plainly there is nothing on the ballot in this precinct this
     election. The sample ballot card is hidden.
   - Any other value (or empty): a banner saying the status could not be confirmed, with a
     link to the county's official lookup. Cards stay as for `In Election`.
5. Cards, in this order, each a `section` with an `h2`: Polling places near you, Sample
   ballot, Early voting, Your districts. Until #12, #14, #16 and #15 fill them, each card's
   body is one line pointing to the county's official lookup.
6. An `aria-live="polite"` region, in the DOM from the first render, is empty while loading
   and says "Results for precinct <code> are ready." once loaded.
7. On load, focus moves to the results heading (`h1`, `tabIndex={-1}`).
8. A failed load shows a `role="alert"` message instead of the cards: "not found" for a
   malformed or unknown code, a generic failure otherwise, each with the official lookup
   link and "Search another address". Richer error handling is #18; share and invalid-code
   UX beyond this is #17. The heading shows the URL's code only when it matches
   `PRECINCT_CODE`; otherwise it reads "Precinct not found", so a crafted link cannot put
   arbitrary text in the page's main heading. (Added after review finding 1.)
9. All new text lives in `src/features/lookup/resultsCopy.js`; no party, candidate or
   officeholder names; no address or coordinates anywhere in the page, URL or storage.

## Files that change

- `src/features/lookup/precinctStatus.js` (new): `precinctStatus(precinct)` returns
  `{ kind: 'in-election' | 'nonresidential' | 'not-in-election' | 'unknown', message, showBallot }`.
- `src/features/lookup/precinctStatus.test.js` (new): fixture tests for all three values plus
  unknown and a nonresidential field with no message.
- `src/features/lookup/resultsCopy.js` (new): all results-screen text.
- `src/features/lookup/PrecinctStatusBanner.jsx` (new).
- `src/features/lookup/ResultsCards.jsx` (new): the ordered cards and their skeletons.
- `src/features/lookup/PrecinctPage.jsx`: replaced; fetches, renders states, live region,
  focus.
- `src/features/lookup/PrecinctPage.test.jsx` (new): fetch stubbed with recorded fixtures.
- `src/App.test.jsx`: stub `fetch` in the `/p/:precinct` tests so they make no network call.

## Order of work

1. `precinctStatus` tests, then the module.
2. Page tests (loading skeleton, loaded header, each banner, card order and ballot card
   hiding, live region text, focus, not found, failure, no address in the URL), then copy,
   banner, cards and page.
3. Adjust `App.test.jsx`.
4. Full gate, live drive in Chrome against the dev server and the live ArcGIS layer.

## Risks

- StrictMode runs effects twice: the fetch effect ignores a result after cleanup.
- A stale result after the code changes: the results component is keyed by the code.
- Live region timing: the region exists before the text changes, so screen readers announce.
- Focus on load can surprise sighted keyboard users; the heading is the top of the content,
  so it is the expected landing point.

## Proof

- Criteria 1, 3, 4, 5: `PrecinctPage.test.jsx` with the `precinct-by-id` (In Election) and
  `precinct-nonresidential` fixtures and a Not In Election variant; `precinctStatus.test.js`.
- Criteria 2, 6, 7: page tests (skeleton while fetch is pending, live region empty then
  filled, `document.activeElement` is the `h1`).
- Criterion 8: page tests for a malformed code (no fetch, generic heading), an empty result,
  an HTTP 404 and an HTTP 500 (skeleton through the one retry, then the failure).
  The heading test failed first, before the fix, with
  `Expected "Precinct not found", Received "Precinct Polls moved to City Hall"`.
- Criterion 9: a page test that the URL history is only `/p/<code>` and web storage is empty.
- Criterion 9 also: copy review, and the existing `no-inner-html` and hardcoding tests.
- Live drive: `/p/CC007` and `/p/AP200` against the live layer show the right header,
  banner and cards; focus lands on the heading; a lookup from the home page lands there.
