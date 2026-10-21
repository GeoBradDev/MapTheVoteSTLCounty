# Plan: Out-of-county handling, with a St. Louis City message (issue #8)

Risk tier: Medium. It decides which official office a voter is sent to (election-critical
copy and links), adds a new query to the data client, and a new UI component; but every
branch is a pure function over a point and a geocoder-neutral place, fully unit testable
with recorded fixtures.

Domain skills:
- superpowers:test-driven-development: invoke.
- vercel-react-best-practices: invoke for the notice component (small, presentational).
- frontend-design: not applicable because the notice is plain text and links in the
  existing token classes; the results screen layout is #11.
- context7: not applicable because only `fetch` and React Testing Library APIs already in
  use are needed.
- expo, django, django-ninja, fastapi, claude-api, dataviz: not applicable because none of
  those stacks are involved.

Mode: commit. The owner authorized commits, pushing this issue branch, the PR and its squash
merge for this run, and delegated plan approval for this run.

## Geocoder independence

Issue #7 (which geocoder) is parked on an owner decision. This change does not depend on
it. It takes a **place**: `{ lat, lng, state?, county? }`, WGS 84 coordinates plus the
optional two-letter state and county name a geocoder returned. Checked live on 2026-10-21,
both candidates supply those fields for the three test addresses:

| Address | Census `geographies/onelineaddress` | Esri `findAddressCandidates` (`outFields=Subregion,RegionAbbr`) |
|---|---|---|
| 1200 Market St, St. Louis, MO 63103 | state `MO`, Counties `NAME` `St. Louis city` (GEOID 29510) | `RegionAbbr` `MO`, `Subregion` `St. Louis city` |
| 200 N 2nd St, St. Charles, MO 63301 | `MO`, `St. Charles County` | `MO`, `St. Charles County` |
| 301 W Main St, Belleville, IL 62220 | `IL`, `St. Clair County` | `IL`, `St. Clair County` |

"Use my location" (#9) has only coordinates, so `state` and `county` are optional and an
unknown place gets its own message.

## Acceptance criteria

1. `src/data/arcgis.js` exports `isInCountyBoundary({ lat, lng })`, a point query on
   `election.layers.countyBoundary` that resolves `true` when the point is inside the
   county outline and `false` otherwise, with the same timeout, retry and error types as
   the other queries and only coordinates in the request.
2. `src/features/lookup/locate.js` exports `locate(place)`, which resolves to exactly one of:
   - `{ kind: 'precinct', precinct }` when `getPrecinctAtPoint` finds a precinct;
   - `{ kind: 'county-unmatched' }` when no precinct is found but the point is inside the
     county boundary, or (when the boundary query fails) the geocoder says St. Louis
     County, Missouri: the voter is sent to the county's official lookup;
   - `{ kind: 'stl-city' }` when outside the county and the place's county is St. Louis
     City (Missouri; matched by name, `St. Louis city`, `Saint Louis City`, `City of St.
     Louis`, case and punctuation insensitive, never `St. Louis County`);
   - `{ kind: 'missouri' }` when outside the county and the state is Missouri;
   - `{ kind: 'out-of-state' }` when the state is known and is not Missouri;
   - `{ kind: 'unknown' }` when outside the county and the state is not known.
   Names are matched ignoring case and punctuation; the state may be `MO`, `Missouri` or
   the Census FIPS code `29`. `classifyPlace(place)` is exported too: the geocoder fields
   alone, with an internal `st-louis-county` result that `locate` turns into
   `county-unmatched` (boundary query failed) or `missouri` (outside the boundary).
   A precinct query error rejects (the caller shows #18's error state). A boundary query
   error does not: it falls back to the place's fields. Invalid coordinates throw
   `TypeError` before any request.
3. "No precinct found" is the primary outside-the-county signal; the boundary query runs
   only when no precinct is found.
4. `src/features/lookup/OutOfCountyNotice.jsx` renders a kind, short and kind:
   - `stl-city`: says the address is in the City of St. Louis, which has its own election
     board, and links to the St. Louis City Board of Election Commissioners at
     `https://www.stlouis-mo.gov/government/departments/board-election-commissioners/`.
   - `missouri`: links to the Secretary of State Voter Outreach Center
     (`https://voteroutreach.sos.mo.gov/PRD/VoterOutreach/VOSearch.aspx`).
   - `out-of-state`: a short generic message to contact the local election office.
   - `unknown`: says the location is outside the county, links to the Voter Outreach
     Center for Missouri voters (it covers St. Louis City too), and the generic advice
     for elsewhere.
   - `county-unmatched`: links to the county's official lookup (`election.officialLookupUrl`).
   Every link opens the official site in the same tab (no surprise new window), with
   `rel="noreferrer"` so the official site is not sent our page path.
   The notice is a `section` labelled by an `h2`, for the results screen (#11) to place.
5. The two referral URLs live in one module, `src/config/referrals.js`, with their source
   and a last-verified date; no other file under `src/` writes them.
6. All copy for the notice is in one `copy` object in
   `src/features/lookup/outOfCountyCopy.js` (its own module, since the fast-refresh lint
   rule allows only components in a `.jsx` file) so #19 can move it into `en.json` without
   touching the markup. (i18n itself is #19, still open.)
7. Tests cover one City address, one St. Charles County address and one out-of-state
   address end to end through `locate` with recorded precinct and boundary responses for
   those points, plus each kind's rendered notice.
8. Nonpartisan and official-sources-only: the copy names no party or candidate, and every
   link goes to a government site.

## Files that change

- `src/config/referrals.js` (new): City board and SOS Voter Outreach URLs, source, date.
- `src/data/arcgis.js`: `isInCountyBoundary`.
- `src/data/arcgis.test.js`: boundary query tests.
- `src/features/lookup/locate.js` (new) and `locate.test.js` (new).
- `src/features/lookup/OutOfCountyNotice.jsx` (new) and `OutOfCountyNotice.test.jsx` (new).
- `src/features/lookup/outOfCountyCopy.js` (new): the notice's text.
- `scripts/record-fixtures.mjs`: record the precinct and boundary responses at the three
  test points and one inside point.
- `docs/raw/fixtures/*.json`: the new recordings.
- `docs/data.md`: the county boundary section and the out-of-county referral rule.

## Order of work

1. Record fixtures (boundary inside/outside; precinct at the City, St. Charles and
   Belleville points).
2. TDD `isInCountyBoundary`.
3. TDD `locate` and the place classification.
4. TDD `OutOfCountyNotice`.
5. Docs.

## Risks

- Sending a City voter to the county, or the reverse. Mitigated: the City match is on the
  county name only, anchored, and tested against `St. Louis County`.
- A dead or wrong official link. `stlelections.com`, often cited for the City board, is a
  parked domain "for sale" as of 2026-10-21; the board's page is on the City's own site.
  The SOS link is the one the county's own apps use as their no-results link
  (`docs/raw/instant_app_config.json`); it answers 403 to curl (Cloudflare) but is the
  county's own choice.
- Wiring into the results screen is #11 and the address flow #10; this change ships the
  pieces and their tests, not a route. The map outline from the boundary layer is #13.

## Proof

- Criterion 1: `arcgis.test.js` boundary tests (request parameters, true/false from
  recorded responses, retry on 5xx).
- Criteria 2, 3, 7: `locate.test.js` with the three addresses' recorded responses and
  geocoder-neutral places, plus each fallback branch.
- Criteria 4, 6, 8: `OutOfCountyNotice.test.jsx` checks each kind's text and link hrefs.
- Criterion 5: `OutOfCountyNotice.test.jsx` asserts the links equal the `referrals.js`
  values, and a test scans `src/` for the two URLs outside `referrals.js`.
- Live drive: no route renders the notice yet (#11), so the live drive runs `locate` from
  Node against the live layers at the three test points and prints the kinds.
