# Plan: Home page: remove the Shortest lines list, make the wait times link a button, keep the address search above the fold (issue #209)

Risk tier: Medium. Stateful UI across the calendar states (the lazy dot map, the head
script's reserved box) that unit tests cannot fully exercise, and it changes existing home
page behavior and order across a few files; no data, money or auth paths.
The requirements are the owner's (issue body, 2026-10-24), relayed as decided by the
coordinator, so the plan proceeds without a separate approval pause.

Domain skills:
- frontend-design: invoke (button styling, page order).
- vercel-react-best-practices: invoke (React component change, first-load budget).
- chrome-devtools-mcp:a11y-debugging: not applicable because the repo's own axe, 44 px and
  focus e2e checks (e2e/a11y.e2e.js) cover the change and run in the gate.
- superpowers:test-driven-development: invoke.
- Backend, data, payments, email skills (django, fastapi, expo): not applicable, no such code.

## Acceptance criteria

1. The home page dot map no longer shows the "Shortest lines now" list or the board note
   ("Each board's sites are for its own voters..." / its Election Day form). The wait
   times page keeps its own board note.
2. The "See early voting wait times" link is an in-app `<a>` drawn as a button with the
   shared `Button` component (`to="/early-voting"`, secondary variant, at least 44 px tall,
   visible focus ring), labeled "Detailed early voting wait times map", and on Election Day
   "Detailed Election Day line counts map". Sentence case, as every other control on the site
   ("Find my precinct", "Use my location"); the issue asks for a label "like" its title-case
   wording. Full width with centered text, as the "Use my location" button above it.
3. The address box (combobox), "Find my precinct" and "Use my location" are fully in the
   viewport without scrolling at 360 x 640, 375 x 667, 390 x 844 and 1280 x 800, in every
   calendar state: outside the map window, early voting open, every site closed, the evening
   before Election Day, Election Day before polls open, Election Day. An e2e test asserts it.
4. Nothing below the dot map box moves when the map arrives (the reserved height still
   holds), and the reserved heights match the new, shorter tallest state.
5. Tests and docs that only covered the removed UI are removed or updated; no test for
   anything that stays is deleted. First-load JS stays within the 120 KB budget, unchanged.

## Files that change

- `src/features/lookup/HomePage.jsx`: order header, address lookup, map box, then the
  button link; `Button` replaces `TextLink` for the wait times link.
- `src/features/waitTimes/WaitDotMap.jsx`: drop the list and the board note; keep the
  stale line ("No site has a current line count right now.") as the open-but-no-count state.
- `src/features/waitTimes/dotMapModel.js`: drop `shortest` and `SHORTEST_COUNT`; `stale`
  computed from whether any open site has a count.
- `src/features/lookup/homeCopy.js`, `src/i18n/en.json`: drop `home.waitMap.shortest` and
  `home.waitMap.site`; new labels for `home.waitTimes` and `home.waitTimesElectionDay`.
- `src/index.css`: new reserved heights for the box, measured.
- Tests: `WaitDotMap.test.jsx`, `dotMapModel.test.js`, `HomePage.test.jsx`, `App.test.jsx`,
  `e2e/a11y.e2e.js`, `e2e/prerender.e2e.js`, `src/waitTimesFallback.test.jsx` if it names
  the removed text.
- `e2e/a11y.e2e.js` also: the heading focus ring test's first Tab now lands on the address
  box (its ring is checked, then the first link's).
- `README.md`: the dot map paragraph (order, no list, no board rule) and any link label.

## Order of work

1. Tests first: update unit tests to the new label, order and absent list (red).
2. Model, dot map, home page, copy (green).
3. Build, measure the box's tallest state at 320, 360, 640+ px; set `src/index.css`.
4. e2e: above-the-fold test over all states and viewports; replace "Shortest lines now"
   ready markers; move the "stays put" check to the element below the box (the button).
5. README.

## Risks

- #104 kept the wait times link on the first screen of a 360 x 640 phone, above the search.
  With the search first (#209) the button follows the dot map, or outside the map window the
  address lookup's notes, so it is below the fold on a phone. The owner's criterion is the
  search; putting the button above it would push the search down and, as the Election Day
  label can wrap differently, move it after hydration. The e2e no longer asserts the button
  above the fold.

- Moving the search above the map reverses #184's "map first" order; it is the only way to
  hold criterion 3 at 360 x 640 (the map alone is about 600 px). The map stays on the first
  screen's scroll path right under the search.
- Under-reserving the box would shift the button and nav (CLS); measure the stale state,
  which is now the tallest, with a margin for wrapping.
- First-load budget: `Button` is already in the first load (AddressLookup), so no growth.

## Proof

- Unit: WaitDotMap tests assert no list and no board note in every state; HomePage tests
  assert the button link's name, href, class and order after the address box.
- e2e: `the address search sits above the fold` for each state and viewport;
  `the button stays put when the map loads` per state; axe runs on every home state.
- Live drive: build and preview, at 360 x 640 during early voting and on Election Day,
  screenshot the first screen with the search visible and the button styled.
