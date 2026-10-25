# Plan: County lookup: a typed "Town & Country" does not match the TOWN & COUNTRY community (issue #212)

Risk tier: Medium. It alters existing behavior of `words()`, the one spelling step every
address source shares (County address points, Photon, the City geocoder), on the
election-critical lookup path (raised one tier); the change itself is one line in one file and
fully unit testable, so it is not raised further.

Domain skills: superpowers:test-driven-development, invoke. superpowers:systematic-debugging,
invoke (bug; cause traced in the issue and confirmed in the code below). Frontend, React,
accessibility and design skills: not applicable because no UI or component code changes.

## Cause

`recordOf` in `src/data/countyAddress.js` gives a County record the municipality
`MSAG_COMMUNITY_NAME` with `&` replaced by `AND`, so `TOWN & COUNTRY` compares as
"town and country". `words()` in `src/data/addressMatch.js` splits typed text on anything but
letters and digits, so a typed "Town & Country" reads as "town country", which is neither the
record's mailing city nor its municipality: `matchesTyped` rejects it and the lookup answers no
match (or ambiguous). A typed street has the same gap: "9300 Lewis & Clark Blvd" reads as
"lewis clark blvd" and does not match the record street LEWIS AND CLARK BLVD.

## Acceptance criteria

1. `words('Town & Country')` is `['town', 'and', 'country']`, the same as
   `words('Town and Country')`; `&` with or without spaces around it ("Town&Country") reads the
   same way.
2. A County record with `MSAG_COMMUNITY_NAME` `TOWN & COUNTRY` matches
   "1318 Ross Ave, Town & Country" (and "1318 Ross Ave, Town & Country, MO" with the record's
   ZIP) as it matches "1318 Ross Ave, Town and Country" today.
3. A typed `&` in a street reads as "and": "9300 Lewis & Clark Blvd Unit A, Bellefontaine
   Neighbors" answers as "9300 Lewis and Clark Blvd Unit A, Bellefontaine Neighbors" does in
   `countyAddress.test.js` (a match at the unit A record).
4. The strict rules hold, so no typed text matches a wrong community or precinct:
   - "1318 Ross Ave, Town & Country" does not match a record whose community is another town
     (LADUE) and whose mailing city is Saint Louis;
   - "Town & Country" with a ZIP other than the record's is not a match;
   - "Town Country" (no `&`, no "and") and a partial "Town &" still do not match the
     TOWN & COUNTRY community;
   - an `&` typed as noise after the street ("1318 Ross Ave & Elm St") is still not a match
     for a record in a named town.
5. Labels, suggestion where clauses (`suggestWhere`, which uses its own `tokens()`), the SQL
   built from typed text, and every result for text with no `&` are unchanged. The whole
   existing test suite passes unchanged.
6. The first-load JavaScript stays under the 121 KB gzipped budget
   (`src/test/build.test.js`). Baseline on `origin/main` d9145ab: 123,329 of 123,904 bytes
   (575 bytes headroom, measured with the same rule as the test).
7. `docs/data.md` (Typed community) no longer says a typed `&` is dropped; it says a typed `&`
   reads as "and", as a record's does.

## Files that change

- `src/data/addressMatch.js`: in `words()`, replace each `&` with ` and ` before splitting;
  update its comment.
- `src/data/addressMatch.ampersand212.test.js`: new, the red test (criteria 1 to 4): `words()`
  directly, plus the County source (`createCountyAddressSource` with a stubbed fetch and
  `precinctsAt`, built like `countyAddress.municipality143.test.js`) for the community and the
  street cases.
- `docs/data.md`: the Typed community sentence (criterion 7).
- `docs/progress.md`: the progress log line for #212 (Phase 8, if the repo's convention for a
  merged issue asks for it at PR time; otherwise no change).

## Order of work

1. Write `src/data/addressMatch.ampersand212.test.js`; run it and confirm the criterion 1 to 3
   cases fail because `&` is dropped (not for a setup reason) and the criterion 4 cases pass.
   Commit it alone, red; add it to `.claude/fix-lock`.
2. Change `words()`; run the new test and the full suite green; `rm .claude/fix-lock`.
3. Build and measure the first-load bytes against the baseline.
4. Phases 5 to 8: two finders, gate, live drive, verifier, `docs/data.md`.

## Risks

- `words()` feeds every comparison in `addressMatch.js`, the City suggest filter
  (`cityAddress.js`), and the County name check in `geocoder.js`. Both sides of every comparison
  go through `words()`, so a source's own `&` also reads as "and" (Photon or the City giving
  "Town & Country" now equals a typed "Town and Country"). The change adds a word only where an
  `&` was; text without `&` reads exactly as before. A new match needs the typed `&` to sit where
  the source has "and" (or `&`), which names the same place. Riskiest step: an `&` that was
  harmless noise, such as an intersection typed after the street ("100 Main St & Elm St"); today
  that is rejected as an unknown town ("elm st") and after the change as "and elm st", still
  rejected. The test covers it.
- Budget: about 20 raw bytes; the headroom is 575 gzipped bytes.
- Chose not to: remove the now redundant `.replace('&', 'AND')` in `recordOf` (keeps the
  municipality string as #143 documented and tested it); change `tokens()` or `suggestWhere`
  (they build SQL from `[A-Z0-9]` words only, and a typed `&` there only narrows suggestions;
  "9300 Lewis & Clark" not suggesting LEWIS AND CLARK is left as a Note for the PR).

## Proof

- Criteria 1 to 4: `src/data/addressMatch.ampersand212.test.js`, red before the fix, green
  after.
- Criterion 5: the full `npm test` suite unchanged and green, including
  `countyAddress.test.js`, `countyAddress.municipality143.test.js` and the frozen #58
  AddressSearch tests.
- Criterion 6: `src/test/build.test.js` in the gate, plus the measured bytes before and after.
- Criterion 7: the diff of `docs/data.md`.
- Live drive: `npm run build` then `npm run preview`; in the browser, type
  "<a real Town and Country address>, Town & Country" (found from the live County layer by a
  query for `MSAG_COMMUNITY_NAME = 'TOWN & COUNTRY'`) and confirm it opens the same precinct page
  as the "Town and Country" spelling; then a wrong-town edge ("<same address>, Ladue") still
  gives no precinct.
