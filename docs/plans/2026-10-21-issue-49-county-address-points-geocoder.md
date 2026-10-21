# Plan: County address points as the primary geocoder (issue #49)

Risk tier: High. The change edits the Content-Security-Policy (security config), replaces
the provider behind the address search that every lookup uses (altering behavior), adds an
async chain of three network sources with timeouts and fallbacks, and touches several
files. A wrong answer sends a voter to the wrong precinct. The owner's decision in the
issue (2026-10-21) stands in for plan approval; the run is unattended and the PR says so.

Domain skills:
- superpowers:test-driven-development: invoke.
- chrome-devtools-mcp (chrome-devtools): invoke for the live drive under the production CSP.
- vercel-react-best-practices: not applicable because the only React change is the copy of
  the attribution line; no effects, fetching or memoization change.
- frontend-design: not applicable because no layout or visual change.
- context7: not applicable because the code uses plain `fetch` and the ArcGIS REST query
  operation, already used by `src/data/arcgis.js`.
- expo, django, django-ninja, fastapi, claude-api, dataviz: not applicable because none of
  those stacks are involved.

## Acceptance criteria

1. `1318 Ross Ave, Saint Louis, MO 63146` resolves to CC007.
2. All 10 polling place test addresses (`scripts/check-geocoder.mjs`) resolve to their
   expected precincts with 0 wrong.
3. With the county live layer blocked (simulated), lookups still succeed through the
   hosted copy or Photon.
4. A St. Louis City address still gets the City referral.
5. The geocoder interface is unchanged: `suggest(text, { signal })` and
   `geocode(textOrSuggestion, { signal })`, a county place is
   `{ lat, lng, state: 'Missouri', county: 'Saint Louis County', label }`, and the app
   geocoder is one frozen object, the same on every import.
6. County queries ask only for `STATUS = 'Current'`. The `where` clause is built only from
   a validated integer house number and street words reduced to `[A-Z0-9]`, so typed text
   can never inject SQL or LIKE wildcards.
7. The address goes to the county layers only in a POST body, never in a URL, with no
   cookies, no referrer and `cache: 'no-store'`. Nothing is stored.
8. Chain: county live layer, then the hosted copy only when the live layer is unavailable
   (error, non-2xx, timeout, malformed body), then Photon. Short per-source timeouts (live
   2.5 s, hosted 3 s, Photon unchanged at 8 s).
   - A county match by house number and whole street (strict rules as Photon's: direction,
     street type, typed ZIP and typed town must agree) is the answer.
   - When the county has two different addresses that fit (different ZIP or far apart),
     the answer is no match, with no fallback: the official data says it is ambiguous.
   - Units: records of one address (same number, street and ZIP) are one place; a typed
     unit picks its own record when it exists, else the building's.
   - County no match: Photon, as today.
   - Every source unavailable: `GeocoderUnavailableError`. A county answer of no match with
     Photon unavailable: no match (null).
   - Aborting the signal rejects with an AbortError at any step and never falls through.
9. A county match not confirmed by a typed ZIP or a typed town other than St. Louis is
   cross-checked with Photon (3 s cap). If Photon finds a St. Louis City address that fits
   the text, the answer is no match (ask for the ZIP), because the county layer cannot see
   City addresses. If Photon fails or is slow, the county match stands.
10. Suggestions come from the county layer (`FULL_ADDRESS LIKE '<typed>%'`, typed text
    normalized to county abbreviations, small `resultRecordCount`, units collapsed to their
    building unless a unit is typed). Photon suggests only when the county layers are
    unavailable or have none. A picked suggestion carries its place, so geocoding it sends
    nothing.
11. `render.yaml` `connect-src` adds `https://maps.stlouisco.com` and
    `https://services2.arcgis.com`; `src/test/render.test.js` checks the exact policy.
12. The attribution credits St. Louis County (GIS Service Center, address points) and keeps
    Photon and the OpenStreetMap credit; the privacy line names both services.
13. `scripts/check-geocoder.mjs` compares live county, hosted copy, Photon, the app chain
    and the app chain with the live layer blocked, on the 10 addresses plus 1318 Ross Ave;
    `docs/data.md` and `README.md` record the result and the new design.

## Files that change

- `src/data/addressMatch.js` (new): the strict typed-text matcher moved out of
  `photon.js` unchanged (`words`, `matchesTyped`, `labelOf`, `countyOf`, `typedZip`, ...),
  plus `typedUnit` and `isConfirmed`, so both providers share one set of rules.
- `src/data/photon.js`: imports the matcher; adds `findPlaces(text)` (every place that fits
  the text) used by `geocode` and by the City cross-check.
- `src/data/countyAddress.js` (new): `createCountyAddressSource({ url, fetch, timeoutMs })`
  with `suggest` and `find` (`{ status: 'match', place, confirmed } | { status: 'none' } |
  { status: 'ambiguous' }`), the two layer URLs and the county attribution.
- `src/data/geocoder.js`: `createGeocoder({ sources, fallback })`, the chain; the default
  export built from the live layer, the hosted copy and Photon; combined `attribution`.
- Tests: the moved matcher stays covered by the existing `photon.*.test.js` files. New
  `src/data/countyAddress.test.js`,
  `src/data/geocoderChain.test.js`; edits to `src/data/geocoder.test.js` (the app geocoder
  is now the chain; provider-file allowlist), `src/test/render.test.js` (CSP),
  `src/features/lookup/GeocoderAttribution.test.jsx`.
- `src/features/lookup/GeocoderAttribution.jsx`, `src/features/lookup/lookupCopy.js`.
- `render.yaml`: `connect-src` and its comment.
- `scripts/check-geocoder.mjs`, `docs/data.md`, `README.md`.

## Order of work

1. Plan commit.
2. Extract the matcher to `addressMatch.js`; Photon tests stay green unchanged.
3. County source, test first: where-clause builder (injection cases), parsing, matching,
   units, ambiguity, POST request shape, errors and timeout, suggestions.
4. Chain, test first, with fake sources: order, fallbacks, ambiguity stop, cross-check,
   abort, all-unavailable.
5. App geocoder, attribution, CSP, render test.
6. Check script against live services; docs.
7. Full gate; live drive in Chrome under the production CSP (vite preview with the
   render.yaml headers), including the live layer blocked by request blocking.

## Risks

- County street spelling versus typed text (Saint/St, Mount/Mt, ordinals, trailing spaces
  in `ADRSTR`). Mitigation: the server filter is loose (`ADRSTR LIKE '%<one word>%'` with
  spelling variants, plus the exact house number) and the strict match runs in the browser
  on canonical words, the same rules Photon results pass today. A miss falls through to
  Photon, never to a guess.
- A City address with the same number and street as a county one, typed without a ZIP:
  handled by criterion 9.
- The live server's firewall blocked a Python client. Node and curl work; the browser path
  is verified in Chrome under the production CSP.
- Slow live layer: 2.5 s cap, then the hosted copy, so the worst case stays near today's.
- Choices not made: no hosted-copy query after a live "no match" (the live layer is the
  newer superset, so the 2023 copy could only add a retired address); no circuit breaker
  that skips a failing live layer for later lookups.

## Proof

- Criteria 5 to 10: `src/data/countyAddress.test.js`, `src/data/geocoderChain.test.js`,
  `src/data/geocoder.test.js`, existing `photon.*.test.js`.
- Criterion 11: `src/test/render.test.js`. Criterion 12: `GeocoderAttribution.test.jsx`.
- Criteria 1 to 3 and 13: `node scripts/check-geocoder.mjs` output against the live
  services.
- Criteria 1, 3, 4 live: Chrome on the built site with the production CSP: 1318 Ross Ave
  opens `/p/CC007`; with `maps.stlouisco.com` blocked it still resolves; a City address
  shows the City referral; no CSP violations in the console.

## Revisions during implementation

- A random sample of county address points, typed as stored and as a person would, found
  misses that the plan's rules did not cover. Fixed, each with a test first:
  - a street named for a direction ("East Ln") or a street type ("Plaza Dr",
    "Center Ave") had no street word for the server filter;
  - letter-first unit numbers ("Apt N230") were read as a town (shared matcher:
    `isUnitNumber` now accepts any word with a digit);
  - county street types (`PLZ`, `XING`, `CV`, `CTR` and others) are now canonical
    spellings in the shared matcher, and the clear ones are street types for the
    "no street type after the street" rule;
  - complexes have up to about 330 unit records at one number, so a find asks for up
    to 1000 records (not 100), and an answer cut off at that limit counts as the layer
    being unavailable (not "no match");
  - units spread over a large parcel (18771 Olive Street Rd, about 400 m) made a real
    address ambiguous; the address's own record (no unit) now answers when it exists,
    and the 300 m rule applies only when there is none.
- The county's Cloudflare firewall blocks queries with `IS NULL` or `<>`; the app's
  queries use only `=`, `LIKE`, `AND` and `OR`, and a block is a 403 that falls through to
  the hosted copy.
- `scripts/check-geocoder.mjs` also checks the City referral for City Hall.
- Review round 1 (finder): the county has separate houses at one number, street and
  ZIP (50 Country Club Ln 63033 in Black Jack and Florissant; 2100 Walton Rd 63114 in
  Vinita Park and Overland), in different precincts. Two records with no unit are now one
  house only in one municipality (`MUNI`) and within about 50 m, else no match, and a
  typed unit counts only when exactly one record has it. County suggestions no longer
  carry a point (criterion 10 changes): a pick is found again by its label under every
  rule, because one label can be two houses. Also: the credit names the GIS Service
  Center, a street type inside a street name stays as typed in suggestions, the chain
  rejects with AbortError when aborted right after a county answer, and the check
  script uses the app's hosted timeout.
- Review round 2 (finder): a unit of an address can be in another municipality than its
  house (1950 Walton Rd 63114, two precincts, about 110 such addresses). Without exactly
  one record for a typed unit, every record of the address must share one `MUNI`, else
  no match. Non-home records (poles, towers, billboards, ATMs, substations) are ignored.
  Word lookups use `Object.hasOwn`, so "constructor" is a plain word. A unit number with
  a space is suggested as its address. The chain checks for an abort after the City
  cross-check.
- Review round 3 (finder): complexes in one town whose units span two precincts (4005
  Ripa Ave 63125, about 20 such), so the municipality and distance rules of rounds 1
  and 2 are replaced by one rule: unless a typed unit is exactly one record, an address
  with more than one point answers only when the precinct layer finds one precinct at
  all its points (new `getPrecinctCodesAtPoints` in `src/data/arcgis.js`, one POST
  multipoint query); two precincts or a failed check is no match. `MUNI = 'STL'`
  records (44 City addresses in the layer) get the City as their county, so criterion
  4 holds for them. Accepted and documented: the 2023 hosted copy can miss a second
  house added since, which matters only while the live layer is down.
- Review round 4 (finder): a point with no precinct (a City record) adds nothing to the
  precinct check, so 6200 Enright Ave 63130 (City and University City units) answered
  with a county point. Records that disagree on county are now no match. A county
  record in the City skips the City cross-check (it already gets the City referral).
  The precinct check is capped at 4 s and stops on abort. The privacy notice now says
  the points of an address's several records go to the election maps for the check.
- Review round 5 (finder): one number and street in a named town and in a "Saint
  Louis" mailing area (2 Colonial Ct: Ladue and Florissant) answered the Ladue house,
  because the named-town house failed the town rule before the ambiguity check. Unless
  a ZIP or a town other than St. Louis is typed, every record at that number and street
  now counts for the ambiguity check (`matchesStreet` in the shared matcher). Picked
  suggestions, Photon's too, are geocoded again by label through the whole chain
  (criterion 10 changes again: no pick skips the county). The suggestion prefix maps
  whole four-letter types ("Road", "Lane") and takes a ZIP typed without a comma as a
  ZIP filter. The privacy notice, README and docs say exactly when Photon gets the
  address for the City check.
- Review round 6 (second extra finder): a street typed without its direction matched
  only the street without one (101 Elm Ave vs 101 N Elm Ave, two towns and precincts);
  a named-town house that the text could mean but did not confirm handed over to
  Photon, which could answer another house (601 Washington Ave: Glencoe and the City);
  and the precinct and county checks read the strict matches, not every record of the
  address. Now one candidate set (number and street, plus directional variants when no
  direction is typed), narrowed only by a typed ZIP or a typed town other than plain St.
  Louis, feeds every check; candidates with no strict match are no match. This was the
  second extra finder in a row whose findings needed fixes, so the review loop stopped
  here per the workflow; the fixes are covered by tests and live checks, not by a
  further finder.
- Live drive after round 6: "101 Elm Ave, St. Louis, MO" still answered JEF008, because
  the typed town was read against the first record's street ("N Elm Ave", one word
  longer than typed). The town is now read against the street as typed. Fixed with a
  test and re-driven in Chrome (now "add your ZIP").
