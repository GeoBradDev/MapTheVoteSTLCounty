# Data sources: November 3, 2026 General Election

Inspected 2026-10-20 with `node scripts/inspect-data.mjs`. Raw schema and sample
dumps are in `docs/raw/`. Re-run the script before each election and update this file.

The County precinct and polling place layers are read through `src/data/arcgis.js`, the St.
Louis City layers through `src/data/cityArcgis.js` (St. Louis City, at the end). Their tests
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
- City precinct codes take a different shape so one route serves both (see
  [Jurisdictions and precinct codes](#jurisdictions-and-precinct-codes)).
- File name pattern: a dash after the prefix (`CC007` becomes `CC-007.pdf`,
  `BON001` becomes `BON-001.pdf`). All 974 match. The app relies on it (#82): the card
  shows a link only when its file name names the precinct, ignoring case, hyphens and
  `.pdf`, and otherwise links the county's official lookup.
- Coverage: all 974 `In Election` precincts have a `.pdf` link in `html`.
- For the 239 `Nonresidential Precinct` rows, `html` holds plain text instead of
  a link: "This precinct has no recognized residential addresses for voting.
  Pursuant to Sections 115.135 and 115.155 of the Revised Statutes of Missouri, a
  voter may only register to vote using a residential address. Please contact us
  at 314-615-1800 if you have any questions."
- This matches the county Instant App: app `4c3116b1...` uses web map
  `8d2f3ffe...`, whose `precincts` layer points at `precincts_2026_11_view/1` and
  whose popup is just `{html}` followed by `{districts}`.

Parsing: `parseSampleBallot` in `src/data/sampleBallot.js` reads the field with a
small, strict tokenizer. It takes the `href` of the first `<a>` tag that has one,
accepts it only when it matches `sampleBallotUrlPattern` in `src/config/election.js`,
and takes the file name from the link text. A field with no link comes back as plain
text. A rejected link, or markup the parser does not know (it reads only text,
comments, a few formatting tags, and the attributes `href`, `target`, `title` and
`rel`), comes back as nothing. Never render `html` as raw
HTML; a test fails on `dangerouslySetInnerHTML` anywhere under `src/`.
The data health check (`node scripts/check-config.mjs`, see the README) runs the parser
over every precinct on the live layer and fails unless each `In Election` precinct has its
own valid link whose file name names that precinct, and every other precinct a message. It also sends a `HEAD` request to 5
random links (or more with `--ballot-sample <n|all>`) and expects `application/pdf` with a
`Content-Disposition` file name that names the link's precinct (#111): the link text can name
the right precinct while the opaque item ID serves another one's PDF. On 2026-10-22,
`--ballot-sample all` checked all 974 live links and every one matched.

Do not use `lookup_view_sample_ballot`. Despite its name, it is a stale view of
`precincts_2024_08_ToPublish` (1199 rows) with older ballot item IDs.

### 2. Polling place join: there is none

**On Election Day, a voter must vote at their assigned polling place** (owner decision on
#72, 2026-10-21, replacing the #1 decision below). RSMo 115.430
(https://revisor.mo.gov/main/OneSection.aspx?section=115.430, read 2026-10-21): "The voter
shall have the duty to appear and vote at the correct polling place" and "Provisional ballots
voted in the wrong polling place shall not be counted." A voter at the wrong place is sent to
the correct one or a central polling place. The Secretary of State's On Election Day page
(https://www.sos.mo.gov/elections/goVoteMissouri/electionday, read 2026-10-21) says the same:
"You can only vote at your assigned polling place or, if there is a problem at your assigned
polling place, you may be eligible to vote at the central polling place."

The #1 decision followed the county FAQ ("Voters in Saint Louis County may vote at any
polling place."), a source retired on 2026-10-21 when the board's old site began redirecting
(see Official website domain); the April 7, 2026 FAQ PDF
(https://extcontent.stlouisco.com/BOE/2026/FAQ.pdf) still says yes to "Can I vote at any
polling place in St. Louis County?". It conflicts with the statute, so the app no longer
says it. The City of St. Louis Board says City voters may vote at any of its listed
locations
(https://www.stlouis-mo.gov/government/departments/board-election-commissioners/voter/polling-places/index.cfm,
read 2026-10-21); that is the City's own rule, for a City results page (#89).

The data assigns no polling place to a precinct (checked again 2026-10-21):
- No precinct field exists on `polls_2026_11_view`, and no polling place field
  exists on `precincts_2026_11_view`. Neither do `11_3_2026_Precincts`,
  `11_3_26_PollingPlaces` or the November 3, 2026 dashboard views.
- The county's own polling place app (`13fb36e7...`, web map `5e98818f...`) is an
  Esri "Nearby" app: "locate Election Day polling places that are closest to the
  address you enter."

**Design consequence:** the app cannot name a voter's assigned polling place. The "Polling
places near you" card lists the closest N (suggest 3 to 5) by straight-line distance from the
looked-up point (geocoded address or "Use my location"), or from the precinct's center
when the page was opened without a lookup (a reload or a shared link). It says the nearest
may not be the voter's assigned polling place, and, like the home page, states the rule with
its sources and how to confirm the assigned place: the county board's number, 314-615-1800,
from the county's Polling Place Lookup app (`13fb36e7...`, whose live config says "call
314.615.1800", read 2026-10-21; the Contact Us page that listed it was retired, see Official
website domain), or the Secretary of State's Voter Outreach Center, which voters "may be able" to use for it.
The layer has only 200 points, so load it whole (about 85 KB GeoJSON with all
fields), keep it in memory up to its max age (README, Election config), and sort on the client.
No extra query per lookup.

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

Point lookup (verified; the app sends these parameters in a POST body, see below):
```
GET .../precincts_2026_11_view/FeatureServer/1/query
  ?geometry=-90.33,38.62&geometryType=esriGeometryPoint&inSR=4326
  &spatialRel=esriSpatialRelIntersects&outFields=*&returnGeometry=false&f=json
```
Shareable URL can carry just `precinct` and re-query with `where=precinct='CC007'`.
The app sends a point lookup as a POST to the same `query` URL with these parameters in
a form-encoded body (#38), never in the URL: the layer answers a POST with the same
features and `Access-Control-Allow-Origin: *`, and a form POST with no custom headers is
a CORS simple request, so no preflight is sent (checked 2026-10-21; the layer's OPTIONS
answer allows `Content-Type` anyway). Queries by precinct code and for whole layers stay
GETs, which the browser may cache.
The app names the precinct fields it reads in `outFields` instead of `*` (#27,
`PRECINCT_FIELDS` in `src/data/arcgis.js`); the polls queries below do the same.

### Polling places: `polls_2026_11_view/FeatureServer/1`

Layer name `polls_2026_11_local`. Point. 200 features. One layer serves both
Election Day and in-person absentee sites.

The app's two polls queries (all places, and the absentee filter below) name only the fields
it reads (`POLL_FIELDS` in `src/data/arcgis.js`) and round coordinates with
`geometryPrecision=6` (#27). Together they shrink the whole layer from about 14 KB to 7 KB
gzipped, checked live on 2026-10-21.

All 200 are Election Day polling places, so the "Polling places near you" card ranks the
whole layer with no filter. The county's own Election Day app (web map `5e98818f...`)
shows this layer, titled "Polling Places (Election Day)", with no definition expression,
and each of the 21 absentee sites also has an Election Day `loc` (for example Board of
Elections is `loc` 019, `loc_abs` 601). `abs_type` marks whether a site is also open for
in-person absentee voting, and which kind of absentee site it is.

| Field | Example | Notes |
|---|---|---|
| `loc` | `001` | Location ID, 3 digits |
| `name` | `AFFTON SR HIGH SCHOOL` | All caps. Title-case for display, carefully (`STLCC`, `UMSL`, `JFK`). |
| `address` | `8309 MACKENZIE RD` | Street only, all caps |
| `zipcode` | `63123` | Integer. City name is not in this layer. |
| `gmap` | `https://www.google.com/maps/search/?api=1&query=38.559645%2C-90.322720` | Ready-made directions link |
| `abs_type` | `none` | `none` (179): Election Day only. `abs` (20): also a satellite absentee site. `boe` (1): also the Board of Elections absentee office. |
| `loc_abs` | `601` | Absentee site number, 601 to 621. Null for `none`. |
| `absentee` | `abs601boec` | Username for the absentee site. Not for display. |
| `inline` | `""` | Blank (spaces or null), and not the 2026 line count source: see Wait times. In 2024 it held text like `"2 voters in line at 06:49 PM"`, padded with spaces. |
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
date, and the early voting card (#16) shows it. Re-read on 2026-10-21 from the app's
live config (`introductionContent` in
`https://www.arcgis.com/sharing/rest/content/items/9301b4594bef4d9c9271778e4648179d/data?f=json`):
unchanged. The county website's old absentee page
(`https://stlouiscovotes.info/voting/absentee-voting/`) showed 2020 hours and an older
five-site list, so it was never a source for these dates; it was retired on 2026-10-21 (see
Official website domain). Re-check the app before launch.

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

Traced on 2026-10-21 and sampled during open hours on 2026-10-22 (#102). Both
jurisdictions report **people in line**. For the City this is the owner's decision
(2026-10-22): its field alias says minutes, but the City Board's own dashboard shows the
same value as people in line (see City below). Keep the unit with the value and never turn one into the other. With no report in the last 2 hours, a site shows a quiet
"No current line count" with its hours and open status still shown; it is never hidden
(owner decision on #102, 2026-10-22, option 1). That is the wait times page
(`/early-voting`). The early voting card on a precinct's results page (#105) lists only the
nearest few sites, so it shows no per-row "no count" text: when none of the sites it shows has
a current count, one line under the list says so. That 2-hour rule applies to both
jurisdictions; the City dashboard's own 1-hour "may be out of date" mark (below) is the City's
display, not this app's cutoff.

The real responses are in `docs/raw/fixtures/` (`county-waits-*.json`,
`city-waits-*.json`), and `src/data/waitFixtures.test.js` checks the join and freshness
facts below against them. `scripts/record-fixtures.mjs` does not record these: a useful
fresh fixture needs reports made during open hours, so record them by hand then with the
queries below.

#### County: `Voters_in_Line_View/FeatureServer/0`

`https://services6.arcgis.com/IeWM0VelvUwce9qE/ArcGIS/rest/services/Voters_in_Line_View/FeatureServer/0`,
in a different ArcGIS org from the polls layer. Keyless, CORS `*`,
`cache-control: max-age=30`. The county's own Absentee Voting Lookup app (web map
`1fe520607dee4bc0ad9f5daa65f40041`) reads it in an Arcade popup expression and shows
"Voters in Line: **12**" and "Reported: MM/DD/YYYY hh:mm A".

- **One row per report:** `linecount` (integer, people in line), `CreationDate` (editor
  tracking, milliseconds), `Creator`, `csv_location_name` (for example
  `601 - ABS - BOARD OF ELECTIONS`; not needed), `objectid` (rises with `CreationDate`).
- **Query:** `where=1=1`, `outFields=Creator,CreationDate,linecount`,
  `orderByFields=CreationDate DESC`, `returnGeometry=false`.
- **Join:** `Creator` = `polls_2026_11_view.absentee` (for example `abs601boec`, the Board
  office). Take the newest row per site. On 2026-10-22 every `Creator` matched one of the
  21 absentee sites.
- **Freshness:** the view's own filter is
  `CreationDate BETWEEN CURRENT_TIMESTAMP - 0.08333333333333333 AND CURRENT_TIMESTAMP AND username LIKE 'abs%'`
  (0.0833 days is 2 hours), so it holds only early voting reports from the last 2 hours. It is empty from about 2
  hours after closing until the sites open (0 rows at 6:47 p.m. on 2026-10-21 and at 7:44 a.m. on 2026-10-22). A row's
  age is `CreationDate`; apply the app's own max age with `isFresh` in
  `src/data/freshness.js` as well.
- **What the samples showed (2026-10-22):** by 9:30 a.m. the view held 61 reports, made
  from 7:59 to 9:30 a.m., from 19 of the 21 sites; JFK Community Center (`abs610boec`) and
  STLCC Meramec (`abs618boec`) sent none. Sites report about every 30 minutes (median gap 29
  minutes, longest 55), one site only once in that span, and some send several reports
  within a minute (the Board office sent 5 between 8:29:05 and 8:30:00). The first reports
  come a minute or so before the 8 a.m. opening. Values ran from 0 to 29. The fresh fixture
  is the 9:00 a.m. response (43 reports).
- **Election Day:** in the official Polling Place Lookup app (web map
  `5e98818fdb354d719193ec562d359050`), only the hidden "Polling Places (2026 08)" layer
  (`polls_2026_08_view`) has the line count popup, joining `Creator` = `username` (for
  example `loc019boec`). The visible "Polling Places (Election Day)" layer
  (`polls_2026_11_view`) has a plain popup with no line count (checked 2026-10-22). Today's
  view filter also keeps only `abs%` reports. So Election Day counts need the County to
  change both the view and the app (#107).
- **Not the source:** `polls_2026_11_view.inline` is blank and neither official popup reads
  it. It was the 2024 source; keep it only as a fallback if #107 finds Election Day uses it
  again.

#### City: `VotingLocations_currentwait_*/FeatureServer/0`

`https://services6.arcgis.com/HZXbCkpCSqbGd0vK/arcgis/rest/services/VotingLocations_currentwait_4533ffc5e0c84851a35cc97e64bb160a/FeatureServer/0`,
owned by `ESRI_BOE` in the City's ArcGIS org (the org of the web map the City Board's
polling places page embeds). The owner confirmed it as the City wait time source on
2026-10-22. Keyless, CORS `*`, `cache-control: max-age=30`. It is a join view: the site row
plus the latest wait report, whose fields carry a numeric suffix
(`created_date_1740505041182`). A republish could rename them, so keep the names in
config.

- **Query (the owner's):** `where=publicview = 'Yes' AND earlyvoting = 'Yes'`,
  `outFields=name,waittime,last_edited_date_1740505041182,created_date_1740505041182`,
  `orderByFields=last_edited_date_1740505041182 DESC`, `returnGeometry=false`. 8 sites: the
  City Board of Elections, Buder, Schlafly, Julia Davis, Walnut Park, Carpenter and
  Kingshighway libraries, and St. Joan of Arc. Sites with no report sort last. Never ask for
  `outFields=*`: the layer also holds staff contact fields (`pocname`, `pocemail`,
  `pocphone`, `created_user`).
- **Join:** `name` (for example `St. Louis City Board of Elections`) is the site key in this
  query.
- **Freshness:** `created_date_1740505041182` is the report time (on 2026-10-22,
  `last_edited_date_1740505041182` matched it on every reported site). The site row's own
  `last_edited_date` (2026-10-09 on 7 sites, 2026-10-21 on St. Joan of Arc) does not move
  with reports, so never use
  it. A site with no report has `waittime` and both report dates null (St. Joan of Arc on
  2026-10-22, whose `comments` say it opens Tuesday, October 27).
- **Unit, people in line (owner decision, 2026-10-22):** the field alias is "Wait Time (Minutes)" and the values seen (0, 3,
  4) fit either unit. The City Board's public "Election Wait Times Dashboard", owned by
  `ESRI_BOE` (dashboard `8548fe3a065a455182181399909102ef`, edited 2026-10-22; web map
  `2ded49cc432d4631a8e76e6584f0a3ac`, edited 2026-10-21), reads this layer with the same
  filter, titles it "People In Line", and shows `waittime` as "**N** Estimated People in
  Line". No City Board `.gov` page linked the dashboard on 2026-10-22. The owner chose
  people in line, as the dashboard shows; `waitTimes.city.unit` in `src/config/election.js`
  holds it.
- **The dashboard's other rules:** it shows a report only while the site is open by its
  `earlyvotingoperhours` and only when the report is from today (Central), marks it "may be
  out of date" after 1 hour, and treats `comments` containing "poll closed" as a closed
  site.
- **What the samples showed (2026-10-22):** at 7:44 a.m. every report was from 4:19 to 6:32
  p.m. on 2026-10-21 (values 0 to 4); at 9:26 a.m. only the Board office had reported (0 at
  8:10 a.m.). The libraries open at 11 a.m. on Thursdays, per `earlyvotingoperhours`.
- **Fixtures:** `city-waits-fresh.json` is the owner's query at 9:26 a.m.
  `city-waits-stale.json` is the 7:44 a.m. response, recorded with a wider `outFields` list
  (it adds `facilityid`, `comments`, the `earlyvoting*` fields and both `last_edited_date`
  fields) before the owner named the query.
- **Not the source:** `Live_Election_Wait_Time_View` (last edited 2024-11-06) and
  `Polling_Centers_WFL1/FeatureServer/1` `Wait_Time__Minutes_` are not read by the
  dashboard.

### County boundary: `St_Louis_County_Boundary/FeatureServer/0`

Polygon, 1 feature (523.98 sq mi). A precinct point query that returns nothing
is the main sign a point is outside the county; `isInCountyBoundary` in
`src/data/arcgis.js` confirms it with a point query on this layer. Use the
boundary for the map outline too.

Out of county: `locate` in `src/features/lookup/locate.js` takes a place,
`{ lat, lng, state?, county? }`, so it works with any geocoder and with
coordinates alone. Photon returns `state` and `county` (for example `Missouri`,
`Saint Louis County`); see Geocoding for St. Louis City. The Census (`geographies`
endpoint, `Counties` layer `NAME`) and Esri (`Subregion`, `RegionAbbr`) geocoders
return them too, for example `St. Louis city`, `MO`. A place the geocoder names as St.
Louis City is asked of the City's precinct layer first (#88), and any other place of the
county's; a point the county layer misses inside the City's outline extent, widened by
about 500 m (`CITY_EXTENT` in `locate.js`), is then asked of the City's, unless the geocoder
puts it out of state or in another county, so a point far from the City is never sent to
it. A place named as the City whose point is in a county precinct gets that precinct: the
point decides, as for every place. A City precinct opens `/p/<City code>`. With no
precinct at the point, a place in St. Louis City (its precinct layer found nothing or
failed), or coordinates alone near the City and outside the county when the City's layer
failed, is sent to the City's Board of Election Commissioners and its polling place lookup,
one elsewhere in Missouri to the Secretary of State Voter Outreach Center (the
county apps' own no-results link), and one outside Missouri gets a generic
message. A point inside the boundary with no precinct goes to the county's
official lookup, and a place with no state (coordinates alone) gets a message for
both Missouri and elsewhere. The referral links are in
`src/config/referrals.js`. The City board's page
is on `stlouis-mo.gov`; `stlelections.com` is a parked domain for sale (checked
2026-10-21), so do not link it.

"Use my location": `getDeviceLocation` in `src/features/lookup/deviceLocation.js`
returns only `{ lat, lng }` from the browser's position, which is the
coordinates-only place `locate` takes. A position whose accuracy radius is missing, negative,
not a valid number or above `MAX_ACCURACY_M` (100 m) is turned away as `coarse` instead, and
nothing is sent for it (#83): a laptop's Wi-Fi or IP estimate, or a phone with precise location
off, can be kilometers off and open the wrong precinct page. Only an accepted position's
coordinates are sent, as the
`geometry` of the precinct and boundary queries, in a POST body with
`cache: 'no-store'`, no cookies and no referrer (#38), never a URL. The app never puts them in the page URL, history state or
browser storage; it keeps them only in memory (`src/features/lookup/lookupPoint.js`), so
the polling places card can measure from them, and a reload drops them. The same goes
for a geocoded address's coordinates.

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

Spike results (issue #7, 2026-10-21). Test script and raw output are recorded in
`docs/plans/2026-10-21-issue-7-geocoding-census-esri-address-search.md`.

**US Census Geocoder** (`geocoding.geo.census.gov/geocoder/locations/onelineaddress`):
free, no key, but **not usable from the browser**. Its responses carry no
`Access-Control-Allow-Origin` header (on GET or on an `OPTIONS` preflight), so a
browser `fetch` from our site is blocked. It has no suggest operation either. Using
it would need a proxy, which would send address text through a server of ours.

**Esri World Geocoder** (`geocode.arcgis.com/.../World/GeocodeServer`): `suggest` and
`findAddressCandidates` both answer browser requests (CORS allowed for any origin).
`searchExtent=-90.74,38.39,-90.11,38.89` with `countryCode=USA` and
`category=Address` keeps suggestions in and around the county. Apartment units come
back as `Subaddress` matches (`8025 Maryland Ave, Unit 5A`).

Esri's terms, read 2026-10-21 for the spike (Esri was not chosen; see Choice below):
- https://developers.arcgis.com/rest/geocode/ : "An ArcGIS Location Platform or
  ArcGIS Online account is required to use the services." Pricing on that page:
  not-stored geocodes 20K free per month, then $0.50 per 1,000; suggests $0.
- https://developers.arcgis.com/rest/geocode/find-address-candidates/ : the `token`
  parameter is "An access token with the required privileges." Results may not be
  stored unless the request passes `forStorage=true` with a valid token. We never
  store results, so `forStorage` stays false.
- Requests without a token still succeed today, but that is not permission: the
  terms require an account and a token.

Accuracy, 10 polling place addresses across the county (north, south, west,
central, unincorporated), each geocoded from its street and ZIP and compared with
the precinct at the county's own point for that site:

| Address | County point | Esri | Census | Photon | Photon (app) | Nominatim |
|---|---|---|---|---|---|---|
| 7700 Fine Rd 63129 (Oakville, unincorporated south) | OAK019 | OAK019 | OAK019 | OAK019 | OAK019 | OAK019 |
| 501 Bowles Ave 63026 (Fenton) | MER025 | MER025 | MER025 | MER025 | MER025 | MER025 |
| 6915 Weber Rd 63123 (Affton, unincorporated) | GRA045 | GRA045 | GRA045 | none | none | GRA045 |
| 1375 Carman Rd 63021 (Ballwin) | MR018 | MR018 | MR018 | MR018 | MR018 | MR018 |
| 12325 Manchester Rd 63131 (Des Peres) | MR006 | MR006 | MR006 | MR006 | MR006 | MR006 |
| 1417 St Louis Galleria St 63117 (Richmond Heights) | CLA019 | CLA019 | **CLA020** | CLA019 | none | **CLA020** |
| 17476 Chesterfield Airport Rd 63005 (Chesterfield, west) | CHE002 | CHE002 | CHE002 | CHE002 | CHE002 | CHE002 |
| 9225 Lackland Rd 63114 (Overland) | MID014 | MID014 | MID014 | MID014 | MID014 | MID014 |
| 1910 Exuma Dr 63136 (north) | NRW020 | NRW020 | NRW020 | NRW020 | NRW020 | NRW020 |
| 11831 Bellefontaine Rd 63138 (Spanish Lake, north) | SF014 | SF014 | SF014 | SF014 | SF014 | SF014 |

Esri: 10 of 10, all `PointAddress` matches. Census: 9 of 10; it interpolates along
street ranges, which put the Galleria in the next precinct. Two apartment addresses
with units (8025 Maryland Ave Unit 5A, 7536 Forsyth Blvd Apt 2, both 63105) gave the
same precinct from both providers. The first 12 to 14 characters typed brought up
the right address as the first Esri suggestion in all 10 cases.

**Photon** (`photon.komoot.io`, open source, OpenStreetMap data), evaluated
2026-10-21 with `q="<street>, MO <zip>"` and a `lat=38.6`, `lon=-90.4` bias: 9 of
10 in the right precinct, all `type: house`; 6915 Weber Rd returned nothing. CORS
is allowed for any origin (`Access-Control-Allow-Origin: *` on GET and on the
preflight). No key. Its site asks for fair use ("extensive usage will be
throttled") and promises no availability; it asks for no credit of its own, but
the OpenStreetMap data license needs "© OpenStreetMap contributors".

The "Photon (app)" column is the app's own provider (`src/data/photon.js`), from
`node scripts/check-geocoder.mjs`: 8 right, 2 no match, 0 wrong. It is stricter
than the raw result on purpose: typed text (the part before the first comma) must
start with the result's house number and then its whole street, word for word, with
the same direction and street type ("100 S Lindbergh Blvd" is not "100 Lindbergh
Blvd", and "8025 Maryland Ave Clayton" is not "8025 Clayton Rd"); a typed ZIP must be
its postcode and a town typed after the street (with or without a comma) its town,
unless it is St. Louis (units such as "Apt 2", the state, the country and numbers are
not part of the town, a direction is ("East St. Louis" is not St. Louis), and "St. Louis
City" must be a City result); and a result in a named
town other than St. Louis needs that town or its ZIP typed, because the same address
can exist in two towns ("St. Louis" is the mailing city for much of the county, so it
confirms nothing). A typed ZIP needs a result postcode, unless the result's own
town (not St. Louis) is typed too, and when matching results are not one address (same
county, and the same postcode or within about 50 m), the answer is no match rather than
Photon's first pick.
Typing a suggestion's own label back always matches. So the Galleria (Photon's answer is 1155, the mall, not 1417)
gives no match instead of a nearby building. Photon also answers "8025 Maryland Ave"
with 8025 Bonhomme Ave, which the check turns into no match. Neither apartment
address above is in OpenStreetMap; both give no match. A no match tells the voter
to add the ZIP, pick a suggestion, try "Use my location" or use the county's official
lookup.
Photon gives St. Louis City, an independent city, as `city: Saint Louis` with no
`county`; the provider fills `county: St. Louis city` for that case so `locate` asks the
City's precinct layer first (#88).

**Nominatim** (public `nominatim.openstreetmap.org`): 9 of 10; the Galleria came back
as a road-level match in CLA020. Ruled out anyway: its usage policy forbids
client-side autocomplete and caps use at 1 request per second.

Choice (owner, 2026-10-21, issue #7): public Photon, called from the browser. No
proxy, no server, no self-hosting, no key. Esri was dropped because its terms need
an account and token; Census has no CORS and no suggest.

Photon is now the last fallback; see County address points below for what the app
does first (issue #49). The Photon provider (`src/data/photon.js`) is created once at
load, at `VITE_GEOCODER_URL` when that is set at build time, else
`https://photon.komoot.io`. Its requests carry the county extent as `bbox`
(`-90.74,38.39,-90.11,38.89`, which also covers St. Louis City), the bias point,
`cache: no-store`, no cookies and no referrer, and time out after 8 seconds. Only
results with a house number count, so a street or area center is never used as an
address. A timeout, network error, non-2xx answer (a 429 included) or malformed
body is a `GeocoderUnavailableError`. Any Content-Security-Policy must allow
`https://photon.komoot.io` (or the `VITE_GEOCODER_URL` origin) in `connect-src`.

### County address points (issue #49)

OpenStreetMap lacks the house numbers for much of the county: in a random sample of
20 county address points Photon had the number for 12, and it has none for the
owner's own test address, 1318 Ross Ave (63146, precinct CC007). So the owner chose
(2026-10-21) the county's official address points first, still from the browser
with no server, proxy or key:

1. **Live county layer:**
   `https://maps.stlouisco.com/hosting/rest/services/Maps/ASR_Address_Points/FeatureServer/0`
   (549,164 points, edited daily). CORS reflects the requesting origin. It sits behind
   Cloudflare, whose firewall blocked a Python client and blocks queries that look like
   SQL attacks (`IS NULL`, `<>`); the app's query shapes (`=`, `LIKE`, `AND`, `OR`)
   pass, from curl, Node and Chrome.
2. **Hosted copy:** `https://services2.arcgis.com/w657bnjzrjguNyOy/arcgis/rest/services/Address_Points/FeatureServer/2`
   (542,647 points, CORS `*`, data last edited 2023-02, so newer addresses are
   missing). ArcGIS Online item `cf0a5470fca14004baee67da7746cdbf`, credited to the
   St. Louis County GIS Service Center. Same fields as the live layer.
3. **Photon**, as above.

The app calls a geocoder only through the interface in `src/data/geocoder.js`:
`suggest(text)` for the address box's suggestions and `geocode(textOrSuggestion)`
for the place, `{ lat, lng, state?, county?, label }`, or null when nothing
matches. The landing screen passes that place to `locate` (see Out of county above);
a precinct opens `/p/<code>`, so only the precinct code goes in the URL.
`geocoder.js` builds one chain at load (`createGeocoder`), from
`src/data/countyAddress.js` (both county layers) and the Photon provider:

- **Finding an address:** a POST to the layer's `query` with
  `ADRNO = <number> AND STATUS = 'Current' AND (ADRSTR LIKE '%<word>%' ...)`: the
  typed house number and one street word in every county spelling (MOUNT and MT,
  ST and SAINT; ordinals as digits). The clause is built only from a validated
  integer and words reduced to `[A-Z0-9]`, so typed text cannot change the query.
  The filter is loose on purpose; the same strict rules as Photon's (whole street,
  same direction and type, a typed ZIP or town must agree, a named town other than
  St. Louis needs its town or ZIP) then decide in the browser
  (`src/data/addressMatch.js`, shared by both providers). County street types
  (`PLZ`, `XING`, `CV` and others) compare equal to their full words.
- **One address, several records:** the county has one number, street and ZIP as two
  houses in two towns (50 Country Club Ln 63033: Black Jack, SPL021, and Florissant,
  SPL026), a unit across a town line from its house (1950 Walton Rd 63114: the house in
  Overland, MID002; Unit R in Vinita Park, UNV031) and apartment complexes whose units
  span two precincts (4005 Ripa Ave 63125: 7 records in LEM012, 38 in LEM021). So a typed
  unit ("Apt 13B", "#2") that exactly one record has answers with that record's point.
  Otherwise the address's own record (no unit), else its first unit, answers only when
  every record of the address is in one precinct: one POST multipoint query to the
  precinct layer (`getPrecinctCodesAtPoints` in `src/data/arcgis.js`), sent only when
  the address has more than one point, and capped at 4 s. Records that are partly in
  St. Louis City and partly in the county (6200 Enright Ave 63130: 27 City units, 31 in
  University City) or two precincts is no match, with no fallback; the voter is pointed
  to "Use my location" and the county's official lookup, or can type the unit. A failed
  or slow check is no match too, with no fallback, but the app asks for
  `reportUnavailable` and so tells the voter that address search is not working and to
  try again (#18). A scan of the hosted copy found about 20 such
  single-town complexes and about 110 addresses with a unit in another town.
- **Not homes:** records for utility poles, cell towers, billboards, ATMs and
  substations (`UNITDESC` `UP`, `CELL TOWER`, `BILLBOARD`, `ATM`, `SUBSTATION`) are
  ignored. A unit number with a space ("2 FL") is suggested as its address, without
  the unit.
- **City records:** the layers hold a few St. Louis City addresses (`MUNI = 'STL'`, 44
  in the live layer); they are given the City as their county, so `locate` asks the City's
  precinct layer for them (#88), with no City check.
- **Every house the text could mean:** the records at the typed number and street,
  and, when no direction is typed, the same street with a direction ("101 Elm Ave" is
  101 Elm Ave 63122 in Glendale, JEF008, and also 101 N Elm Ave 63119 in Webster Groves,
  JEF012; about 160 such pairs in different towns). Only a typed ZIP, or a typed town
  other than plain St. Louis, narrows them; a house in a named town counts though the
  strict rules alone would leave it out for want of its town ("2 Colonial Ct" is in
  Ladue, mailing city Saint Louis, CLA014, and in Florissant, FLO001; about 120 such
  pairs). If any of those houses is the text's but none passes the strict rules (its
  town or direction is not typed), the answer is no match, not a hand-over to Photon,
  which could answer a different house ("601 Washington Ave" is in Glencoe, and in the
  City).
- **Two addresses fit** (two ZIPs or two streets): no match, with no fallback, since
  the official data says the text is ambiguous. A ZIP picks one.
- **No match in the live layer:** Photon. The hosted copy is not asked, because the
  live layer is its newer superset; the copy could only add a retired address.
- **A layer unavailable** (network error, non-2xx such as a firewall 403, ArcGIS
  error body, malformed body, too many records, or no answer in 2.5 s for the live
  layer, 3 s for the hosted copy): the next source. Every source unavailable is a
  `GeocoderUnavailableError`; a county "no match" with Photon unavailable is no
  match, and so is every county source unavailable with Photon finding nothing, except
  that with `reportUnavailable` (which the app passes, #18) both are a
  `GeocoderUnavailableError`: the search could not finish. The hosted copy is from 2023: when it answers, an address that became two
  houses since then still resolves to the one it knows. That needs the live layer to
  be down at the same time, and the owner chose the copy as the first fallback knowing
  it is older.
- **St. Louis City:** apart from those few records, the county layers hold no City
  addresses, so after a county no match the City's own geocoder is asked, before Photon
  (City as a source, below, #88). A City address whose number and street the county also
  has needs the City check below (issue #58).
- **Suggestions:** `STATUS = 'Current' AND FULL_ADDRESS LIKE '<typed>%'` in county
  spelling (AVENUE as AVE, SAINT as ST, a typed ZIP as `ZIPCODE = '<zip>'`), 25 records ordered by address, units collapsed to their
  address unless a unit is typed, at most 5 shown. A street type in the middle of a
  name stays as typed ("Olive Street Rd"). County suggestions carry no point, since
  one label can be two houses: a pick is found again by its label (which has the ZIP),
  under every rule above. The City's parcels are suggested after the county's (City as a
  source, below, #88). Photon suggests only when neither has one (a spelling the prefix
  misses, or both unavailable). Every pick, Photon's
  too, is geocoded again by its label through the whole chain, county first, so a
  Photon suggestion cannot skip the county's rules. A ZIP typed after the street, with
  or without a comma, filters by `ZIPCODE` instead of joining the prefix.

Privacy: the address goes to the county layers only in a POST body, never a URL,
with `cache: no-store`, no cookies (`credentials: 'omit'`; the live server sets an
`AGS_ROLES` cookie, which is never stored) and no referrer. Photon gets the address
only when the county has no match or no county layer answers; it gets it in a GET
query string, with `cache: 'no-store'`, no cookies and no referrer, because Photon has
no POST endpoint (`POST /api/` answers 404, checked 2026-10-21, #38). The City check (below) sends the City only the house
number and street, in a POST body, the same way; as a source (#88) the City gets the typed house
number and street (City as a source, below), also while the voter types, the same way. Nothing is stored. The
Content-Security-Policy allows `https://maps.stlouisco.com`,
`https://services2.arcgis.com` and `https://maps6.stlouis-mo.gov` in `connect-src`.

### City check (issue #58)

The county's address points leave out almost every St. Louis City address, and
OpenStreetMap misses many City house numbers, so a City voter whose number and street
also exist in the county got a county precinct: `6135 Washington Ave, St. Louis, MO`
and `6135 Washington Ave` opened FER022 (the county's 6135 Washington Ave 63134; the
City has 6135 Washington Ave 63112), and `6135 Horton Pl, St. Louis, MO 63133` opened
UNV202 (the City has 6135 Horton Pl 63133, about 30 m away). The #49 chain asked Photon
whether the City had the address, and only when no ZIP or town confirmed the county
match; Photon had no point for those City houses, and a Photon outage counted as "not
in the City".

The owner chose (2026-10-21) the City of St. Louis's own geocoder instead:
`https://maps6.stlouis-mo.gov/arcgis/rest/services/GEOCODERS/COMPOSITE_GEOCODE/GeocodeServer`
(`src/data/cityAddress.js`). Its `findAddressCandidates` answers browser requests (CORS
reflects the requesting origin; it sets an `AGS_ROLES` cookie, never stored with
`credentials: 'omit'`), in about 0.15 s. It does not parse a town or state in the
single-line input (`6135 Washington Ave, St. Louis, MO` finds nothing), so it is asked
for the house number and street of the found place only, and the app compares the
answer with the typed text itself:

- **When:** every answer of the chain that could get a county precinct (a county match,
  or a Photon answer that is not in the City and not in another county), ZIP typed or
  not, town typed or not. The one skip is a ZIP entirely outside the City: the Census
  2020 ZIP Code Tabulation Areas that touch the county and do not come within 500 m of
  the City (`COUNTY_ONLY_ZIPS`, from TIGERweb; since #88 also any ZIP not starting 631, as
  every City ZIP does). A ZIP that crosses the City line (63130,
  63133, 63136, 63120, 63147 and others) or is not listed gets the check. The ZIP in a
  picked suggestion's label is the county record's, not the voter's, so for a pick the
  check ignores it: it neither skips the check nor rules out a City parcel in another ZIP
  (a City voter typing `6135 Washington` was offered only the county's 63134 address; since
  #88 the City's 63112 parcel is suggested after it).
  After a pick, every search goes as a pick (`src/features/lookup/AddressSearch.jsx`)
  until the voter deletes or changes the label's ZIP (owner decision, 2026-10-21): editing
  other parts of the label (adding or pasting a unit, deleting ", MO", a space) keeps it.
  Pasting over a selection that holds the ZIP replaces it, and an autofill (an edit with no
  input type) forgets the pick, since the box cannot tell what it replaced. A digit left
  against the ZIP when the voter searches makes it another number, so that search goes as
  typed text; deleting the digit makes it a pick again. Once the pick is forgotten, a ZIP typed later is the voter's own, so a county
  voter can still type a county-only ZIP to get the precinct.
- **A City match:** a `PointAddress` (a City parcel; interpolated `StreetAddress` ranges do
  not count) with the typed house number and whole street under the strict rules
  (`matchesStreet` in `addressMatch.js`), and the typed ZIP when one is typed (a parcel
  with no ZIP is not ruled out). The answer is that City place, so the voter gets the City
  precinct (#88; the City referral before it), never the county precinct. A typed town does not rule a City parcel out.
- **The county and the City list the address in one ZIP** (the City parcel's ZIP is the
  ZIP of the place found: 6135 Horton Pl 63133, county UNV202; 1 Brookings Dr 63130,
  Washington University, county HAD018): no match, since the lookup cannot tell which one
  the voter means (owner decision, 2026-10-21). The voter is pointed to "Use my location"
  and the county's official lookup. A City twin in another ZIP (6135 Washington Ave 63112)
  gets the City precinct.
- **A City parcel the text could mean but not exactly** (its street has a direction the
  text left out, like `1200 Market Pl` and the City's 1200 N Market Pl): no match.
- **The City geocoder unavailable** (network error, non-2xx, error body, malformed body,
  or no answer in 4 s): never the county place. Without `reportUnavailable` it is no
  match; the app passes it (#18), so the voter is told address search is not working,
  with Try again, "Use my location" and the county's official lookup.
- **Cost:** a county voter whose number and street the City also has in another ZIP, who
  types no ZIP, a ZIP that crosses the City line, or picks the county's suggestion, gets the
  City place: the City referral under #58, and since #88 the City twin's precinct. Typing a
  county-only ZIP gets the county precinct. A City geocoder outage makes every lookup without a county-only ZIP whose
  answer could get a county precinct fail (shown as address search not working, #18), picks
  of a suggestion included. The owner accepted both under #58: neither sends a voter to a wrong county precinct.

### City as a source (issue #88)

The same City geocoder finds City addresses the county does not have, ahead of Photon,
which misses many City house numbers (`6135 Washington Ave 63112`, `5010 Nottingham Ave
63109`). `lookup()` and `suggest()` in `src/data/cityAddress.js`:

- **When:** after the county answers no match, unless the text holds a ZIP entirely outside
  the City (`COUNTY_ONLY_ZIPS`, or any ZIP not starting 631). Not when no county source
  answered: the county could have
  the address in the same ZIP (#58), so that search goes on to Photon and the City check.
- **A match:** a `PointAddress` only, under the strict rules every source shares
  (`matchesTyped`): the house number and whole street, and a typed ZIP or town must agree,
  so `1200 Market St, Philadelphia, PA` is not City Hall. Two parcels that fit, or one whose
  street has a direction the text left out, are no match, without Photon. No parcel goes on
  to Photon.
- **What is sent:** `cityStreetOf` the typed text: the text before its first comma, without
  a unit, and without a St. Louis town, the state or a ZIP after it, since the geocoder finds
  nothing when they follow the street. Another town typed without a comma goes too (the
  strict rules then turn the answer away). Text with a ZIP entirely outside the City (one of
  `COUNTY_ONLY_ZIPS`, or any ZIP not starting 631, as every City ZIP does) is never sent.
- **Labels:** a City place and suggestion read `<number> <street>, St. Louis City, MO
  <ZIP>`, so a City address reads apart from its county twin, whose label names its own
  town. A picked City label fails the county's strict rules (it names the City), so it is
  found again by the City, unless the county lists the address in the same ZIP (no match,
  #58).
- **Suggestions:** the geocoder has no suggest operation and matches whole words only, so
  it is asked with `findAddressCandidates` once a house number and a word of at least three
  letters are typed, and its parcels whose number and street start with the typed words
  (the last as a prefix) are shown after the county's, at most 5. `5010 Notting` gets no
  City suggestion; `5010 Nottingham` does. A failed City request adds none, and none are
  shown while no county source answers, since a pick could not then be found again.
- **The City geocoder unavailable:** Photon is asked; a Photon place that could get a
  county precinct still needs the City check, which fails too, so never a county
  precinct. With nothing found, `reportUnavailable` (#18) makes it address search not
  working.

`node scripts/check-geocoder.mjs`, 2026-10-21, rerun with the City check (#58): the 10 polling place addresses
above plus 1318 Ross Ave, each source alone, the app's chain, and the chain with
the live layer blocked:

| Address | Want | Live county | Hosted copy | Photon | App | App, live blocked |
|---|---|---|---|---|---|---|
| 7700 Fine Rd 63129 | OAK019 | OAK019 | OAK019 | OAK019 | OAK019 | OAK019 |
| 501 Bowles Ave 63026 | MER025 | MER025 | MER025 | MER025 | MER025 | MER025 |
| 6915 Weber Rd 63123 | GRA045 | GRA045 | GRA045 | none | GRA045 | GRA045 |
| 1375 Carman Rd 63021 | MR018 | MR018 | MR018 | MR018 | MR018 | MR018 |
| 12325 Manchester Rd 63131 | MR006 | MR006 | MR006 | MR006 | MR006 | MR006 |
| 1417 St Louis Galleria St 63117 | CLA019 | CLA019 | CLA019 | none | CLA019 | CLA019 |
| 17476 Chesterfield Airport Rd 63005 | CHE002 | CHE002 | CHE002 | CHE002 | CHE002 | CHE002 |
| 9225 Lackland Rd 63114 | MID014 | MID014 | MID014 | MID014 | MID014 | MID014 |
| 1910 Exuma Dr 63136 | NRW020 | NRW020 | NRW020 | NRW020 | NRW020 | NRW020 |
| 11831 Bellefontaine Rd 63138 | SF014 | SF014 | SF014 | SF014 | SF014 | SF014 |
| 1318 Ross Ave 63146 | CC007 | CC007 | CC007 | none | CC007 | CC007 |

App: 11 right, 0 no match, 0 wrong; the same with the live layer blocked (the
hosted copy answered). Photon alone: 8 right, 3 no match. The script also checks
that City Hall (1200 Market St, 63103) and the #58 City addresses (`6135 Washington Ave,
St. Louis, MO`, `6135 Washington Ave`, `6109 Washington Ave`) open a City precinct (the City
referral before #88), typed and picked from the county's suggestion and from the City's (rerun
2026-10-22: City Hall W14P02, the Washington Ave addresses W10P02, `5010 Nottingham Ave`
W05P05, `6500 Chippewa St` W02P01, `8900 Riverview Blvd` W13P11; St. Charles, Washington DC
and Philadelphia addresses get no precinct), and that addresses both list in one ZIP (`6135
Horton Pl, St. Louis, MO 63133`, `1 Brookings Dr`, `1 Brookings Dr, St. Louis, MO 63130`,
and the `1 Brookings` pick) are no match, with the live layer and with it blocked: all do.
A random sample of 192 current county address points, each typed both as stored
and as a person would (lower case, full street type, town and ZIP), matched in the
live layer every time.

The county web map also has a `commercial_addresses_view` layer that warns when
an address is commercial, not residential. Worth a later look as an optional
check.

## Basemap

Choice (issue #13): OpenFreeMap's Positron style,
`https://tiles.openfreemap.org/styles/positron`, drawn with MapLibre GL JS. Free, with no
API key or account; its terms (openfreemap.org/tos, updated 2026-10-14) allow embedding it in
a website. Style, TileJSON, vector tiles, sprites and glyphs all come from
`https://tiles.openfreemap.org`, served through Cloudflare. Attribution: OpenFreeMap,
OpenMapTiles, OpenStreetMap contributors. Tile requests reveal the area on screen to OpenFreeMap and
Cloudflare: the precinct plus its nearest polling places, which depend a little on the
searched point within the precinct (and widen on "Show more"). No address or coordinates are
sent as such. The map
is extra help only: precincts and polling places still come from the county layers above.

## Official website domain

The county board's website is now a page on the county's own site:
`https://stlouiscountymo.gov/st-louis-county-government/board-of-elections/`
(the County block's `boardSiteUrl` in `src/config/election.js`, read as `countySiteUrl`, #73). Checked 2026-10-21:

- The board's old site, `stlouiscovotes.info`, is retired. Every page tried (`/`, `/faq/`,
  `/voting/absentee-voting/`, `/about-us/`, `/registration/`) answers `200` with
  `<meta http-equiv="refresh" content="0; URL=...">` to the page above, so no deep link
  survives. The app no longer links or cites it, the learn topics may not cite it
  (`officialSources.js`), and `src/test/retired-sites.test.js` keeps it and
  `stlouiscountymovotes.gov` out of `content/`, `render.yaml`, `index.html` and the code under
  `src/` (comment lines and tests may name them). Sources retired with it: the FAQ (the "vote at
  any polling place" line and the Election Day hours), the Contact Us page (the phone number,
  office address and hours) and the Registration page.
- The board's `.gov` domain, `stlouiscountymovotes.gov`, still answers `301` to
  `https://stlouiscovotes.info/`, which then refreshes to the page above: two hops. Link the
  page directly. `stlouiscovotes.gov` (from the project brief) does not resolve.
- The page answers `403` to scripts (curl, WebFetch, headless Chromium): a Cloudflare bot
  challenge. Browsers load it. Check links to it by hand in a browser, and do not cite its
  text unless someone has read it there. The daily content link check reports it as a skip
  (bot challenge, check by hand) rather than a failure (#74).
- The board's current contact details come from its November 3, 2026 Instant Apps (Polling
  Place Lookup `13fb36e7...` and Absentee Voting Lookup `9301b459...`, read 2026-10-21):
  314-615-1800, Relay Missouri 711 or 800-735-2966, and `vote@stlouiscountymo.gov`. Both apps
  still link `www.stlouiscountymovotes.gov`.
- The newest FAQ found from an official link is a PDF for the April 7, 2026 election
  (`https://extcontent.stlouisco.com/BOE/2026/FAQ.pdf`). It is not a November 3, 2026 source,
  and `extcontent.stlouisco.com` is not an official host for the learn topics.

## Election config

The election-specific values this inspection found, including the early voting
hours above, are in `src/config/election.js`, along with the decisions recorded
in issue #1 (Election Day hours and their sources, the 3 to 5 range for
nearby polling places, the county site URL, moved in #73) and in issue #72 (the Election Day polling place
rule, its sources and the county board's phone number).
When the next election's inspection changes them, edit that file; this doc
records what the inspection found and why.

## Jurisdictions and precinct codes

Owner decision on #86 (2026-10-22): one results route, `/p/:code`, for both St. Louis County
and St. Louis City. The code's shape picks the jurisdiction, so a share link still holds only
the code:

- County: a 2 or 3 letter township prefix plus 3 digits, `/^[A-Z]{2,3}\d{3}$/`, like `CC007`.
- City: `W`, a 2 digit ward, `P`, a 2 digit precinct, `/^W\d{2}P\d{2}$/`, like `W01P12`.
  The County shape never matches it (a County code ends in 3 digits after its letters).

The City's precincts are layer 1 of `ElectionGeography_public_4533ffc5e0c84851a35cc97e64bb160a`
in the City's ArcGIS org (`HZXbCkpCSqbGd0vK`). Its `precinctid` reads
`W <ward> P <precinct>` with no zero padding, like `W 1 P 12`. Checked on 2026-10-22: 207
precincts, every one in that form, wards 1 to 14, precincts 1 to 21 within a ward, no
duplicates. So `W01P12` is `W 1 P 12`. Two digits each leaves room for a ward or precinct
number up to 99. The conversion both ways is `src/data/cityPrecinctCode.js`. The rest of the City layers are under St. Louis City below.

`src/config/election.js` holds the shared election values and one block per jurisdiction
(`county`, `city`), each with its `id`, display name, board, service root, layers and
`sources` (each layer's own description, which the daily link check asks). The
City block holds only what is confirmed. The City board's site and lookup page (its polling
places page, with the Assigned Polling Place Lookup) do not change between elections, so they
are in `src/config/referrals.js`. `src/data/jurisdictions.js` pairs each block with its data:
the County's is `src/data/arcgis.js`. The City's data client is `src/data/cityArcgis.js`
(#87), loaded on demand through `loadCityClient()`; the City adapter still answers "not
found" until the City results page (#89), because the results cards still carry County text
and the County's Election Day rule.

## St. Louis City

Checked live on 2026-10-22 for #87, which settles the layer questions #87 needed from #57:
the Election Day list and its filter, the early voting sites, the City boundary, and districts
for a precinct. Two #57 questions stay open: what the City page's Assigned Polling Place Lookup
calls (the layers assign no polling place to a precinct, below), and whether the U.S. House
"First District" polygon follows the 2025 congressional map (for #90). The
City client is `src/data/cityArcgis.js`, with the same request rules as the County client
(plain fetch, one retry, coordinates only in a POST body). The layers, fields and filters are
in the City block of `src/config/election.js`; `node scripts/check-config.mjs` checks them
(Data health check in the README), and `node scripts/record-fixtures.mjs city-` re-records
their fixtures (`docs/raw/fixtures/city-precinct-*`, `city-districts-*`, `city-polls`,
`city-early-voting-sites` and `city-boundary-*`) along with the City geocoder's
(`city-geocode-*`, #58); the City wait fixtures are recorded by hand (Wait times above).

**Official source.** The City Board of Election Commissioners' polling places page,
`https://www.stlouis-mo.gov/government/departments/board-election-commissioners/voter/polling-places/index.cfm`,
embeds web map `e5fdb4148a5e4134b6defe4e59f4366e` (owner `zakibem_stlcity`, in ArcGIS org
`HZXbCkpCSqbGd0vK`). Every layer below is in that org on
`https://services6.arcgis.com/HZXbCkpCSqbGd0vK/ArcGIS/rest/services`: keyless, CORS `*`,
`cache-control: max-age=30`. The page lists "City-Wide Polling Places": "The locations listed
below are the designated polling places for the November 3, 2026 General Election. Any voter
who is registered to vote at an address within the boundaries of St. Louis City can vote at any
of the listed locations on November 3, 2026. Total 56 polling places", then 8 "No Excuse
Absentee Polling Places" with their hours.

### Precincts: `ElectionGeography_public_4533ffc5e0c84851a35cc97e64bb160a/FeatureServer/1`

207 polygons, `precinctid` like `W 1 P 12` (see Jurisdictions and precinct codes). The app
reads `precinctid` only. `pollingid` and `facilityid` are empty on every row, so no layer
assigns a polling place to a City precinct; on November 3, 2026 any City voter may vote at any
of the 56. A point query (`getCityPrecinctAtPoint`) returns no row outside the City (the county
point -90.33, 38.62 returns none; City Hall returns `W 14 P 2`).

### Districts: `ElectionGeography_public_4533ffc5e0c84851a35cc97e64bb160a/FeatureServer/2`

46 polygons: wards 1 to 14, Missouri House 76 to 82 and 84, Missouri Senate 4 and 5, U.S.
House "First District", Community College Trustee Subdistricts 2 and 3, the Board of
Education, the citywide and statewide offices (one polygon per office, sharing a `districtid`
such as `City of St. Louis` or `State of Missouri`), and two placeholder rows, `electedoffice`
`President of the United States` and `Vice-President of the United States` (`districtid`
`President of the United States` and `Vice President of the United States`, no hyphen), each a
polygon of about 1,100 m² in Web Mercator. A point query returns one row per office there: 22 at City Hall (8
distinct `districtid` values). A districts card should drop the two placeholders and group the
rows that share a `districtid` (#90). The `electedoffice` field's coded values also include party committee posts,
`Committeeman (R)`, `(D)`, `(L)`, `(C)`, `(G)` and the same for `Committeewoman`: no row has
one on 2026-10-22, but a card must never show such a row's office, which names a party. The statewide and some district polygons reach past the City line (the
county point -90.33, 38.62 gets 9 rows, among them Missouri Senate District 4), so a districts
answer is never the test of being in the City: the precinct and boundary queries are. The app reads `electedoffice`, `district` and
`districtid` only. The layer also holds each officeholder's name, photo, party and contact
details (`repname1` to `repname7`, `repimageurl*`, `party*`, `districturl*`, `phone*`,
`email*`, `facebook*`, `twitter*`, `fulladdr*`); the app never asks for them (a test fails if
it does), and never asks for `*`. `electedoffice` names the office as its holder is styled
(`Alderman`, `Alderwoman`), so a districts card should label the district, not the office
(#90).

**Districts for a precinct with no point** (a share link): `BOE/PRECINCTS_2023` on
`maps6.stlouis-mo.gov`, which has `Ward`, `Senate`, `Rep` and `NewCC` on each precinct, still
fails every query that returns its fields or shapes on 2026-10-22 (`400 Unable to perform
query operation` on the FeatureServer, `Failed to execute query` on the MapServer; only count
and ID-only queries answer, the FeatureServer counting 207), so it is not used. Instead,
`getCityDistrictsForPrecinct` asks the districts layer at a point inside the precinct's shared
outline (`interiorPoint` in `src/data/interiorPoint.js`: the middle of the widest stretch inside
the polygon along 9 horizontal lines). It holds because every City precinct lies inside exactly
one district per office: for all 207 precincts, the districts at the interior points along 9
lines across the full-resolution polygon were the same set every time (8 distinct `districtid` values each), and the
ward always matched the precinct's ward. Two other ways fail: a polygon intersect also returns
the districts a precinct only touches (`W 14 P 8` got Missouri House 76, 78 and 79), and the
centroid falls outside `W 14 P 8` and `W 14 P 18`, landing in House 78 and 79 instead of 76.
The interior point of the simplified outline (`maxAllowableOffset` 0.0001, about 10 m) was
inside the full polygon for all 207.

### Voting locations: `VotingLocations_currentwait_4533ffc5e0c84851a35cc97e64bb160a/FeatureServer/0`

76 points, owner `ESRI_BOE`, every row `type = 'Voting Center'`, `nextelectdate` 2026-11-03; `municipality` is `City of
St. Louis` on 73 and empty on 3 (Julia Davis Library, St. Joan of Arc, and Henry Elementary,
which is not public), so the filters do not use it. The same layer is the City wait time source (Wait times
above). The app reads `facilityid` (unique, the site's id, `loc` in the cards), `name`,
`fulladdr` (no ZIP in it) and `pollingPlaceZipCode`. Never `*`: it also holds staff contact
fields (`pocname`, `pocemail`, `pocphone`).

- **Election Day list (`pollsWhere`):** `publicview = 'Yes' AND facilityid <>
  'St._Louis_City_Election_Board'`, 56 sites. Diffed with the page's 56 by name and address:
  the same 56 (spelling only differs: `2501 N 11 St` for 2501 N 11th St, `2524 S Eleventh St`,
  "New Sunny Mount Hunter's Hall" for New Sunny Mount Church at the same address). The 57th
  public row is the Board office, 300 N Tucker Blvd: an early voting site the page lists only
  under No Excuse Absentee, with weekday and last-Saturday hours, not on the Election Day
  list. The row's `operhours` reads `6:00 AM - 7:00 PM` like every other row, and the page's
  map (below) shows it. Owner decision (2026-10-22): leave the Board office off the Election
  Day list, matching the page. `pollsListed` (56) in the config makes the health check warn
  when the filter's count moves.
  7 of the 56 have no `pollingPlaceZipCode` (Srebrenica Genocide association, Busch Student
  Center, Julia Davis Library, Machacek Library, McDonnell Medical Sciences Building, St. Joan of
  Arc, West Side MB Church): the page lists ZIPs for them, the layer does not, so the cards show
  no ZIP there. `accessible` is empty on every row; `disabledentry` and `entrydetails` are
  filled on all 57 (#89 decides whether to show them).
- **Early voting sites (`earlyVotingWhere`):** `publicview = 'Yes' AND earlyvoting = 'Yes'`,
  the owner-confirmed wait time filter: 8 sites, the page's 8 No Excuse Absentee sites (Buder,
  Carpenter, Julia Davis, Kingshighway, Schlafly and Walnut Park libraries, St. Joan of Arc, and
  the Board office). Their `earlyvotingoperhours` match the page's hours, except that the Board
  office's `Mo-Fr (08:00-17:00)` leaves out the page's "Last Saturday Before Election Day: 9
  AM-1 PM" (#91 decides how hours are shown).
- **Not the Election Day list:** `ElectionGeography_public_*` layer 0 has the same 57 public
  rows (it is a view, `publicview = 'Yes'`, of the same data) without the ZIP fields.
  `Polling_Centers_WFL1/FeatureServer/1` is the page's own embedded map ("Active Polling
  Places", filter `status = 1`): 57 rows, the page's 56 plus the Board office, but it gives
  McDonnell Medical Sciences Building as 320 S. Euclid Ave where the page says 4565 McKinley
  Ave, and it carries a `Phone` field. `BOE/Polling_Place_Precincts/MapServer/2` on
  `maps6.stlouis-mo.gov` has 55: the page's list less Machacek Library.

### City boundary: `ElectionGeography_public_4533ffc5e0c84851a35cc97e64bb160a/FeatureServer/2`, `districtid = 'City of St. Louis'`

Neither official server has a City Board election boundary layer (the org's service list and
the `maps6` folders were searched on 2026-10-22). The org's other citywide outlines,
`Census_2020_Citywide` and `Census_2010_Citywide` (owner `gumeli_stlcity`), are Census layers,
not the City Board's, so they are not used. The citywide offices' polygons in the districts
layer are the City outline: 9 rows (mayor, comptroller and the other citywide offices), each
about 281.41 million m² in Web Mercator (within 60 m² of each other), within 300 m² of
the 207 precincts' total area (about 66 square miles on the ground). `isInCityBoundary` asks with `boundaryWhere` for `OBJECTID` only; any row
means inside. A backup to the precinct point query, as the county boundary is for the County.

