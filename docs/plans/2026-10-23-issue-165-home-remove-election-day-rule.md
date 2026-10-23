# Plan: Home page: remove the Election Day rule text; the precinct cards cover it (issue #165)
Risk tier: Low. Removes one component use from a static page; unit, build and e2e tests cover it; no data, API or config change.
Domain skills: superpowers:test-driven-development invoke; frontend-design not applicable because nothing new is designed, only a block removed; vercel-react-best-practices not applicable because no new React logic; chrome-devtools-mcp:a11y-debugging not applicable because the a11y e2e suite already covers the home page and the change only removes content.

## Acceptance criteria
1. The home page (client render and the pre-rendered `dist/index.html`, #99) states no Election Day rule for either jurisdiction: no County rule, no City note, no county board phone line, no rule sources.
2. County precinct pages (PollsCard) still show the County rule with its sources and phone, unchanged.
3. City precinct pages still show the City Board's quoted rule, unchanged.
4. No string, import or comment is left that says the home page shows the rule.

## Files that change
- `src/features/lookup/HomePage.jsx`: drop the `CountyElectionDayRule` import and its box.
- `src/features/lookup/HomePage.test.jsx`: replace the #152 rule test with one asserting the home page shows no Election Day rule (owner-approved behavior change).
- `src/test/build.test.js`: assert the pre-rendered home page holds none of the rule text.
- `src/features/lookup/countyElectionDayRuleCopy.js`, `src/features/lookup/CountyElectionDayRule.jsx`: comments no longer say the home page uses it.
- `docs/data.md`: the polling place section no longer says "like the home page".
- Strings in `src/i18n/en.json` stay: PollsCard still uses all of them.

## Order of work
1. Change the home page test to expect no rule; see it fail.
2. Remove the component from HomePage.jsx; see it pass.
3. Add the build test for the pre-rendered home page.
4. Comments and docs.

## Risks
- Leaving stale mentions ("shared by the home page"); grep for them.
- The /early-voting "ended" line also states the County rule; out of scope (not the home page), left as is per the coordinator.

## Proof
- HomePage.test.jsx: criterion 1 (client render). build.test.js: criterion 1 (pre-render).
- PollsCard.test.jsx, CountyElectionDayRule.test.jsx, PrecinctPage.city89.test.jsx unchanged and green: criteria 2 and 3.
- Live drive: build, preview, load `/`, confirm no rule text; load `/p/CC007` and confirm the County rule.
