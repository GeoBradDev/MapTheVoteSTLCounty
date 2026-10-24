# Plan: City lookup follow-ups from #88: outage edges and pick tracking (issue #144)

Risk tier: Medium. It changes existing lookup behavior (what an Illinois point gets while
the City precinct layer is down) and one heading's copy, across a few files; all of it is
pure logic that the unit tests exercise fully with recorded responses, and it touches no
data, money, auth or analytics path. Scoped by the coordinator as "small, low-risk changes,
defer anything risky" (election 2026-11-03), so the plan proceeds without a separate
approval pause; the PR review is the human gate.

Domain skills:
- superpowers:test-driven-development: invoke.
- vercel-react-best-practices: not applicable because no React component changes (one
  string in `src/i18n/en.json`); the first-load budget is still checked by the gate.
- frontend-design, chrome-devtools-mcp:a11y-debugging: not applicable because no layout,
  style or markup changes; the heading keeps its element and level.
- Backend, data, payments, email skills (django, fastapi, expo): not applicable, no such code.

## The five items, and what this run does with each

1. Illinois point during a City outage: fix (below).
2. County record with no ZIP: checked against the live data, no code change. On
   2026-10-24 the live county address layer and its hosted copy each hold exactly two
   records with no `ZIPCODE`: 4515 Pegasus Dr (unincorporated, 38.484, -90.307) and 7710
   Watson Rd (Shrewsbury, 38.573, -90.332). Neither is inside the City's extent box, and
   the City geocoder has no parcel at either number and street. So the ZIP filter cannot
   drop a county twin of a City address today.
3. One-way twin search: decided as "not twins", pinned by a test and a comment. The City
   lookup answers `city` only when the typed street matches the parcel's whole street,
   direction included, so the City label's street is the voter's own street; a county
   `6135 Foo St` is not what "6135 N Foo St" names under the county's own strict rules
   (its find answers `none` for that text too). Asking the county by the City street is
   therefore the same rule the county applies everywhere.
4. Pick tracking simplification: deferred. It changes no answer today, its #58 tests are
   frozen pending the owner's approval, and removing it a week before the election buys
   nothing for voters. Moved to a follow-up issue for after 2026-11-03.
5. Out-of-state typed address gets "no match": deferred as an owner decision. Changing it
   means widening Photon's box or adding a state check to typed search, a behavior change
   not worth the risk before the election. Moved to the same follow-up issue.

## Acceptance criteria

1. With the City precinct layer failing, Use my location at Venice, IL (38.672, -90.170)
   no longer gets `stl-city`; it gets what it gets with the layer up (`unknown`, "This
   location is outside St. Louis City and County") when the county boundary says it is
   outside the county.
2. A point east of the City's river edge is never treated as possibly in the City for the
   outage fallback, and every vertex of the City's own outline (the City Board's citywide
   district polygon, 2026-10-24) is not east of it, so no City point loses the City
   referral.
3. Points in the City (City Hall) and near it on the Missouri side still get `stl-city`
   when the City layer fails, as today.
4. The `stl-city` notice heading reads "This location is in the City of St. Louis", true
   both for a typed address and for coordinates alone.
5. A geocoder test pins item 3: a City place for "6135 N Foo St" (no ZIP) is the City place
   when the county has only "6135 Foo St".
6. No change to analytics, no address or location stored or sent anywhere new; the
   first-load JS budget stays as it is.

## Files that change

- `src/features/lookup/locate.js`: a `RIVER_EDGE` polyline (the City outline's east side,
  from its northeast corner at Chain of Rocks to the mouth of the River des Peres,
  simplified with Douglas-Peucker at 0.001 degrees, about 21 points) and an exported
  `eastOfCity(point)`: true only when the point's latitude is within the line's range and
  its longitude is more than 0.002 degrees (about 175 m, more than the simplification
  tolerance) east of the line's eastmost crossing at that latitude. The outage fallback
  (`cityFailed && couldBeCity && nearCity(point)`) adds `&& !eastOfCity(point)`.
- `src/features/lookup/locate.test.js`: tests for criteria 1 to 3.
- `src/i18n/en.json`: the `outOfCounty.stlCity.heading` string.
- `src/features/lookup/OutOfCountyNotice.test.jsx`, `src/features/lookup/PrecinctPage.test.jsx`:
  their expected heading text.
- `src/data/geocoder.js`: a comment on `twinFree` recording the item 3 decision.
- `src/data/geocoder.twin144.test.js`: the item 3 tests, through the real county source
  with a fake fetch (both directions of the asymmetry).
- `scripts/record-fixtures.mjs`, `docs/raw/fixtures/city-outline.json`: the City outline
  (all nine citywide office polygons) the river edge test reads.
- This plan.

## Order of work

1. Red tests in `locate.test.js` (Venice during a City outage; outline vertices are not
   east of the edge), then `eastOfCity` and the fallback condition.
2. Heading copy and its tests.
3. Item 3 test (expected to pass as is: it pins current behavior) and comment.
4. Gate: lint, format check, tests, build, e2e, perf budgets.
5. Follow-up issue for items 4 and 5.

## Risks

- A City point mis-classed as east of the edge would lose the City referral during an
  outage. Guarded by the margin and by the test over every outline vertex. Points in the
  City are always west of the edge, so only outage behavior for points in the river or on
  the Illinois bank changes.
- Bundle size: about 21 coordinate pairs in a first-load module, under 200 bytes gzipped,
  within the 1045 bytes of headroom.
- Copy change: "address" to "location" is true in every case the notice shows; the
  Spanish branch (#120) is not merged, so no other locale to update.

## Revision during implementation

- `src/test/election-hardcoding.test.js` flags the date 2026-10-24 outside the config (it
  is an election value). The frozen `locate.test.js` had it in one comment; the comment
  now reads "as recorded for #144". No assertion changed.

## Proof

- Criteria 1 to 3: `locate.test.js` (Venice and East St. Louis with the City layer
  failing; outline vertices; City Hall still `stl-city`).
- Criterion 4: `OutOfCountyNotice.test.jsx`, `PrecinctPage.test.jsx`.
- Criterion 5: the geocoder twin test.
- Criterion 6: the build's first-load budget check and the analytics e2e checks in the gate.
- Live drive: with the dev server, the City layer blocked in DevTools and a geolocation
  override at Venice, IL, Use my location shows "This location is outside St. Louis City
  and County".
