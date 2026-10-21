# Data sources: November 3, 2026 General Election

Inspected 2026-10-20 with `node scripts/inspect-data.mjs`. Raw schema and sample
dumps are in `docs/raw/`. Re-run the script before each election and update this file.

The precinct and polling place layers are read through `src/data/arcgis.js`. Its tests
use live responses recorded in `docs/raw/fixtures/` by `node scripts/record-fixtures.mjs`.

Service root: `https://services6.arcgis.com/wkbq75VVf2MvUvs7/ArcGIS/rest/services`
Portal root: `https://stlouiscovotes.maps.arcgis.com/sharing/rest/content/items`

All layers below are public, allow anonymous queries, have `maxRecordCount` 2000,
and support JSON, GeoJSON, and PBF. Native spatial reference is Web Mercator
(wkid 102100); pass `inSR=4326` / `outSR=4326` to work in lat/lng.

## Summary of the two key questions

### 1. Sample ballot mapping: solved, one field

The precinct layer's `html` field already holds a link to that precinct's
sample ballot PDF. No separate lookup is needed.

```
precinct = "CC007"
html     = "Sample Ballot: <a href=https://stlouiscovotes.maps.arcgis.com/sharing/rest/content/items/f1daf903ee6945b4a8fcb4391dc3ba4c/data>CC-007.pdf</a>"
```

- Following that URL returns `200`, `content-type: application/pdf`,
  `content-disposition: attachment; filename="CC-007.pdf"`. This is the example
  item from the project brief, confirmed to belong to precinct `CC007`.
- Each PDF is its own portal item (type `PDF`, tag `Sample Ballots November 2026`,
  owner `whartnett_edboec`). The item ID is random, so the PDF URL **cannot be
  built from the precinct code**. It has to be read from `html`.
- Precinct codes are a 2 or 3 letter township prefix plus 3 digits
  (`/^[A-Z]{2,3}\d{3}$/`, for example `CC007`, `BON001`), checked against all 1213.
- File name pattern: a dash after the prefix (`CC007` becomes `CC-007.pdf`,
  `BON001` becomes `BON-001.pdf`). All 974 match. Useful for display only.
- Coverage: all 974 `In Election` precincts have a `.pdf` link in `html`.
- For the 239 `Nonresidential Precinct` rows, `html` holds plain text instead of
  a link: "This precinct has no recognized residential addresses for voting.
  Pursuant to Sections 115.135 and 115.155 of the Revised Statutes of Missouri, a
  voter may only register to vote using a residential address. Please contact us
  at 314-615-1800 if you have any questions."
- This matches the county Instant App: app `4c3116b1...` uses web map
  `8d2f3ffe...`, whose `precincts` layer points at `precincts_2026_11_view/1` and
  whose popup is just `{html}` followed by `{districts}`.

Parsing: `parseSampleBallot` in `src/data/sampleBallot.js` pulls the `href` with a
regex (unquoted, single- or double-quoted), accepts it only when it matches
`sampleBallotUrlPattern` in `src/config/election.js`, and takes the file name from the
link text. Anything else comes back as plain text, or as nothing when a link is
rejected. Never render `html` as raw HTML; a test fails on `dangerouslySetInnerHTML`
anywhere under `src/`. `node scripts/check-sample-ballots.mjs` runs the parser over
every precinct on the live layer and exits 1 unless each `In Election` precinct has
its own valid link and every other precinct a message. Run it before each election.

Do not use `lookup_view_sample_ballot`. Despite its name, it is a stale view of
`precincts_2024_08_ToPublish` (1199 rows) with older ballot item IDs.

### 2. Polling place join: there is none, by design

**St. Louis County voters may vote at any polling place on Election Day.**
The county FAQ (https://stlouiscovotes.info/faq/, checked 2026-10-20) says:
"Voters in Saint Louis County may vote at any polling place." and "To find the
nearest polling place, please use our polling place lookup tool."

The data agrees:
- No precinct field exists on `polls_2026_11_view`, and no polling place field
  exists on `precincts_2026_11_view`.
- The county's own polling place app (`13fb36e7...`, web map `5e98818f...`) is an
  Esri "Nearby" app: "locate Election Day polling places that are closest to the
  address you enter."

**Design consequence:** the "Your polling place" card becomes "Polling places
near you": the closest N (suggest 3 to 5) by straight-line distance from the
geocoded point, with a plain note that any polling place in the county works.
The layer has only 200 points, so load it once (about 85 KB GeoJSON with all
fields), cache it, and sort on the client. No extra query per lookup.

## Layers

### Precincts (primary): `precincts_2026_11_view/FeatureServer/1`

Layer name `precincts_2026_11_local`. Polygon. 1213 features.

| Field | Example | Notes |
|---|---|---|
| `precinct` | `AP001` | Key. 2 or 3 letter township code + 3 digits. Max length 6. |
| `precinct_type` | `Voting Precinct` | Values: `Voting Precinct`, `Nonresidential Precinct` |
| `in_election` | `In Election` | Values seen this election: `In Election` (974), `Nonresidential Precinct` (239). `Not In Election` does not appear for Nov 2026 but the UI should still handle it. |
| `congressional_district_25` | `US Representative District 1 (2025)` | Use this one. Current (2025) map. |
| `congressional_district_20` | `US Representative District 1 (2022)` | Old map. Do not show. |
| `state_senate_20` | `State Senate District 14` | |
| `legislative_district_20` | `State House District 73` | State House |
| `county_council_20` | `County Council District 2` | |
| `township` | `Airport Township` | |
| `municipality` | `City of Woodson Terrace` | `Unincorporated` is a real value |
| `ward` | `City of Woodson Terrace Ward 2` | Some cities use "District" instead of "Ward" |
| `school` | `Ritenour School District` | One value is prefixed `CUMULATIVE VOTING - ` |
| `junior_college_district` | `St. Louis Community College Subdistrict #1` | |
| `fire` | `Community Fire Protection District` | |
| `ambulance`, `ambulance_subdistrict` | `""` | Usually empty |
| `library_district` | `St. Louis County Library` | |
| `sewer` | `Metropolitan St. Louis Sewer District` | `No Sewer District` is a value |
| `light_district`, `road`, `community_improvement`, `business_district`, `transportation`, `neighborhood_improvement_dist`, `annexation` | `""` | Special districts, usually empty |
| `active` | `252` | String. Matches `RV_Count` on the dashboard layer, so likely registered voter count. Do not show. |
| `districts` | `...<br>...` | Pre-joined list of all districts, `<br>` separated. Includes both congressional maps. Prefer the individual fields. |
| `html` | see above | Sample ballot link, or nonresidential message |

Empty fields come back as `""` here (and as `null` on the dashboard view). Treat
both as empty.

Point lookup (verified):
```
GET .../precincts_2026_11_view/FeatureServer/1/query
  ?geometry=-90.33,38.62&geometryType=esriGeometryPoint&inSR=4326
  &spatialRel=esriSpatialRelIntersects&outFields=*&returnGeometry=false&f=json
```
Shareable URL can carry just `precinct` and re-query with `where=precinct='CC007'`.

### Polling places: `polls_2026_11_view/FeatureServer/1`

Layer name `polls_2026_11_local`. Point. 200 features. One layer serves both
Election Day and in-person absentee sites.

| Field | Example | Notes |
|---|---|---|
| `loc` | `001` | Location ID, 3 digits |
| `name` | `AFFTON SR HIGH SCHOOL` | All caps. Title-case for display, carefully (`STLCC`, `UMSL`, `JFK`). |
| `address` | `8309 MACKENZIE RD` | Street only, all caps |
| `zipcode` | `63123` | Integer. City name is not in this layer. |
| `gmap` | `https://www.google.com/maps/search/?api=1&query=38.559645%2C-90.322720` | Ready-made directions link |
| `abs_type` | `none` | `none` (179): Election Day only. `abs` (20): satellite absentee site. `boe` (1): Board of Elections office. |
| `loc_abs` | `601` | Absentee site number, 601 to 621. Null for `none`. |
| `absentee` | `abs601boec` | Username for the absentee site. Not for display. |
| `inline` | `""` | Line count text, filled in on Election Day. Older layers show the format `"2 voters in line at 06:49 PM"`. Trim it: some values are padded with spaces. |
| `notes` | `LOC001` | Internal. Not for display. |
| `notes_abs` | `Voting entrance is outside; use the pink door next to Cheesecake Factory` | Voter-facing note for absentee sites. Trim padded spaces. |
| `username` | `loc001boec` | Internal. Not for display. |

Polling place hours are **not** in any layer. Election Day hours were confirmed
from official sources in issue #1 and live in `src/config/election.js`.

### In-person absentee (early) voting

Use `polls_2026_11_view` with `where=abs_type IN ('abs','boe')` (21 sites). This is
the same filter the county's Absentee Voting Lookup app uses (app `9301b459...`,
web map `1fe52060...`).

Dates and hours are not in the data. The county's Absentee app config
(`introductionContent`, published 2026-09-22) says:

- Board of Elections (725 Northwest Plaza Dr, 63074): weekdays Tuesday,
  September 22 through Friday, October 30, 8 a.m. to 4:30 p.m.; Saturday,
  October 24 and Saturday, October 31, 9 a.m. to 1 p.m.; Monday, November 2,
  8 a.m. to 5 p.m.
- Satellite sites: weekdays Tuesday, October 20 through Friday, October 30,
  8 a.m. to 4:30 p.m.; Saturday, October 24 and Saturday, October 31,
  9 a.m. to 1 p.m.; Monday, November 2, 8 a.m. to 5 p.m.

This is in `src/config/election.js` with a source link and "last verified"
date. It should be re-checked against the county website before launch.

### `sat_name_export_2026_11/FeatureServer/0`

Point, 21 features, one field `abs_site` with a coded domain (`abs_boe`,
`abs_thornhill`, `abs_galleria`, ...). This is an internal list of the same 21
absentee sites with no names, addresses, or hours. **Not needed**; use
`polls_2026_11_view` instead.

### `2026_11_abs_ballot_app_precincts_view/FeatureServer/0`

Polygon, 1213 features, fields `precinct`, `precinct_type`, `in_election` only.
Same precinct set as the main layer, stripped down, used by the county's
absentee ballot application map. **Not needed.**

### `November_3_2026_Polling_Places_Dashboard_view/FeatureServer/0`

Point, 221 features. Internal operations layer: staffing (`ROUTE_CAPTAIN`,
`JUDGE_DEPUTY`, `TECH_AREA`), room names, photos (`PHOTO_URL`), and
`ED_VOTES` / `ABS_VOTES` turnout counts. Joins to the polls layer on
`LOCATION_ID` (integer) = `loc` (zero-padded string), confirmed for
Thornhill Branch Library (172).

**Not for v1.** It carries no wait times, has more rows than the public polls
layer (221 vs 200, so some are not active sites), and turnout by site is not
something voters need. `PHOTO_URL` could be a later nice-to-have for finding the
entrance.

### `November_3_2026_Precincts_Dashboard_view/FeatureServer/0`

Polygon, 1213 features. Unofficial turnout per precinct (`RV_Count`,
`TOTALCHECK`, `ABSCHECK`, per-site absentee vote counts like `BOE_VOTES`).
**Not for v1.** Turnout is outside the scope of a "how do I vote" tool.

### Wait times

Two sources, neither active yet:
- `polls_2026_11_view.inline`: empty now. On Election Day it should fill with
  line counts (format from past elections: `"N voters in line at HH:MM PM"`).
  This is what the county's polling place popup shows.
- `Voters_in_Line_View` in a **different org**
  (`services6.arcgis.com/IeWM0VelvUwce9qE/.../Voters_in_Line_View/FeatureServer/0`),
  fields `csv_location_name`, `linecount`, `CreationDate`. 0 records today. It is
  layered into the county polling place map.

Proposal: show `inline` when it is non-empty, with its timestamp, and label it
as reported by the county. Revisit `Voters_in_Line_View` on Election Day.

### County boundary: `St_Louis_County_Boundary/FeatureServer/0`

Polygon, 1 feature (523.98 sq mi). Use it for the "is this address in the
county" check. In practice a precinct point query that returns nothing already
means "outside the county." Use the boundary for the map outline and as a
fallback.

### Legacy `lookup_view_*` services: do not use

| Service | Actually points at |
|---|---|
| `lookup_view_sample_ballot` | `precincts_2024_08_ToPublish` |
| `lookup_view_precincts` | `precincts_2024_04` |
| `lookup_view_polls`, `lookup_view_abs` | `polls_2024_04` |

These are left over from 2024. Their names look current, but they are not.

## Geocoding

The county Instant App uses a **private** Esri utility proxy
(`utility.arcgis.com/usrsvcs/servers/d5419f11.../World/GeocodeServer`). It is
tied to the county's subscription and should not be used from our app.

Plan (to check in step 2): US Census Geocoder for address lookup. It is free
and needs no key, but it has no autocomplete and may not allow CORS calls from
a browser. If those are blockers, fall back to the Esri World Geocoder
`suggest` + `findAddressCandidates`. TODO: test both before choosing, and check
Esri's current terms on keys and free use instead of assuming them.

The county web map also has a `commercial_addresses_view` layer that warns when
an address is commercial, not residential. Worth a later look as an optional
check.

## Official website domain

`stlouiscovotes.gov` (from the project brief) does **not** resolve.
The county's `.gov` domain is `stlouiscountymovotes.gov`. As of 2026-10-20 it
returns a `301` redirect to `https://stlouiscovotes.info/`. The redirect comes
from the `.gov` domain, which only government bodies can register, so that
redirect is the county's own choice. Some deep links on the `.info` site
return 404 (for example `/voting/voting-locations/`), so check every source
link before using it. The Instant Apps list the county contact as
314-615-1800 and `vote@stlouiscountymo.gov`. The website lists
`stlouiscovotes@stlouisco.com`. TODO for Brad: confirm which email is current.

## Election config

The election-specific values this inspection found, including the early voting
hours above, are in `src/config/election.js`, along with the decisions recorded
in issue #1 (Election Day hours and their sources, and the 3 to 5 range for
nearby polling places).
When the next election's inspection changes them, edit that file; this doc
records what the inspection found and why.
