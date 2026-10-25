# Data sources: November 3, 2026 General Election

Inspected 2026-10-20 with `node scripts/inspect-data.mjs`. Raw schema and sample
dumps are in `docs/raw/`. Re-run the script before each election and update this file.
The Service inventory, at the end, lists every service in the County and City orgs and why
each is used or not; the script prints any service it does not mention.

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

**On Election Day, a registered St. Louis County voter may vote at any polling place in St.
Louis County** (owner decision on #152, 2026-10-22, reversing the #72 decision). The owner's
words: "Registered voters may vote at any polling place within St. Louis County. This does not
apply to the separate City of St. Louis election jurisdiction." The County Board's own Polling
Places page
(https://stlouiscountymo.gov/st-louis-county-government/board-of-elections/elections/polling-places/,
read in a browser on 2026-10-22; scripts get the Cloudflare 403, see Official website domain)
says: "Voters in Saint Louis County may vote at any polling place in the County on Election
Day." The April 7, 2026 FAQ PDF (https://extcontent.stlouisco.com/BOE/2026/FAQ.pdf, read
2026-10-22) answers "Yes." to "Can I vote at any polling place in St. Louis County?". The rule
(`electionDayPollingPlace` in `src/config/election.js`) cites the Polling Places page, and
`src/config/election.test.js` holds it there.

The #72 decision (2026-10-21) had followed RSMo 115.430
(https://revisor.mo.gov/main/OneSection.aspx?section=115.430): "The voter shall have the duty
to appear and vote at the correct polling place" and "Provisional ballots voted in the wrong
polling place shall not be counted", and the Secretary of State's On Election Day page
(https://www.sos.mo.gov/elections/goVoteMissouri/electionday), which says a voter can only
vote at their assigned polling place. The County Board's page quoted above says County voters
may vote at any polling place in the County, so the app no longer cites either for the County
rule and no longer says "assigned polling place" to County voters. The provisional ballots topic still
cites RSMo 115.430, which applies statewide, for what happens at the wrong polling place,
after the County rule says any County polling place is a County voter's right one.

The City of St. Louis Board says City voters may vote at any of its listed locations
(https://www.stlouis-mo.gov/government/departments/board-election-commissioners/voter/polling-places/index.cfm,
read 2026-10-21, re-read 2026-10-22); that is the City's own rule, unchanged by #152. A City
results page quotes it (`electionDayRule` in `src/config/cityResults.js`, #89), and shows none
of the County rule.

The data assigns no polling place to a precinct (checked again 2026-10-21):
- No precinct field exists on `polls_2026_11_view`, and no polling place field
  exists on `precincts_2026_11_view`. Neither do `11_3_2026_Precincts`,
  `11_3_26_PollingPlaces` or the November 3, 2026 dashboard views.
- The county's own polling place app (`13fb36e7...`, web map `5e98818f...`) is an
  Esri "Nearby" app: "locate Election Day polling places that are closest to the
  address you enter."

**Design consequence:** the app does not name one polling place for a precinct, and a County
voter needs none: any County polling place will do. The "Polling places near you" card lists
the closest N (suggest 3 to 5) by straight-line distance from the looked-up point (geocoded
address or "Use my location"), or from the precinct's center when the page was opened without
a lookup (a reload or a shared link). It says the voter may vote at any polling place in St.
Louis County, and states the rule with its source and the county board's
number for help, 314-615-1800, from the county's Polling Place Lookup app (`13fb36e7...`,
whose live config says "call 314.615.1800", read 2026-10-21; the Contact Us page that listed it
was retired, see Official website domain).
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
| `congressional_district_20` | `US Representative District 1 (2022)` | Use this one. The 2022 map, in effect on November 3, 2026 (see below). Districts 1 and 2. |
| `congressional_district_25` | `US Representative District 1 (2025)` | The 2025 map (H.B. 1), not in effect. Do not show. Districts 1, 2 and 3. |
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

**Which congressional map (#150).** The 2022 map applies on November 3, 2026, so the
districts card reads `congressional_district_20`. The Revisor's note on
[RSMo 128.346](https://revisor.mo.gov/main/OneSection.aspx?section=128.346), read on
2026-10-23: on September 3, 2026, in Glahn v. Hoskins, No. SC101805 (Mo. banc), the Missouri
Supreme Court held the referendum petition on H.B. 1 (the 2025 map) sufficient, so H.B. 1 does
not take effect unless voters approve it, and "The congressional districts established by the
General Assembly in 2022 remain in full force and effect for the November 2026 general
election." The board's own sample ballots agree: 121 of the 1213 precincts have different
districts in the two fields, 95 of those have a ballot, and on every one of the 95 the
"U.S. REPRESENTATIVE - DISTRICT N" race matches `congressional_district_20` (checked
2026-10-23 by reading each PDF). The health check fails if any precinct's value is not a 2022
map district (`congressionalMap` in `src/config/election.js`). For a later election,
recheck which map is in effect before choosing the field. St. Louis City is in the first
district under both maps (RSMo 128.461 and 128.471).

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
| `loc_abs` | `601` | Absentee site number, 601 to 621. Null for `none`. Keys the site's early voting room (Polling place rooms, #100). |
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

### Polling place rooms: `November_3_2026_Polling_Places_Dashboard_view/FeatureServer/0`

Point, 221 features. The board's internal operations layer: staffing (`ROUTE_CAPTAIN`,
`JUDGE_DEPUTY`, `DEPUTY`, `CAPTAIN`, `SUPER_CAPTAIN`, `TECH_AREA`), room names, photos
(`PHOTO_URL`), `ED_VOTES` / `ABS_VOTES` turnout counts and `esritask_*` task fields.
Published publicly by the County Board's own org (`wkbq75VVf2MvUvs7`), by the same editors
as the polls layer; `Query` only, CORS `*`.

**Used for one field only: the room (#100).** Owner decision, 2026-10-23: show the room a
voter goes to inside the building, labeled as coming from St. Louis County Board of
Elections data ("Room names are from St. Louis County Board of Elections data." under the
list). County only: the City's voting locations carry their own entrance notes (#89). The
app asks for `LOCATION_ID,ACTIVE,ACTIVE_ROOM` only, with no geometry, never `*` and never a
staffing, photo, turnout or task field (`src/data/arcgis.js` `getPollRooms`; a test fails
if the query names one). It is shared and refreshed like the polls layer (#84), and the
results page asks for it beside the polls request; a place shows without its room until it
answers, and when it fails.

- **Join:** `ACTIVE = 'ACTIVE'` rows (200, one per Election Day place, distinct
  `LOCATION_ID`s): `LOCATION_ID` (integer) = `loc` (zero-padded string), on the polls card.
  `ACTIVE = 'ABSENTEE'` rows (21): `LOCATION_ID` = `loc_abs` (601 to 621), on the early
  voting card. An absentee site has both: its Election Day room by `loc` and its early
  voting room by `loc_abs` (Clark Family Branch Library, `loc` 029: `EVENT SPACE A + B`
  as 603).
- **Rooms:** all caps, title-cased with care (`GYM LOBBY` reads "Gym Lobby"; room letters
  and codes stay upper case: `EVENT SPACE A + B`, `MP1/MP2 ROOMS`, `ROOM HS109A`). A row
  with no room, or a location whose rows name different rooms, shows no room line.
- **Checked live on 2026-10-23** (data last edited 2026-10-07): `ACTIVE_ROOM` is filled on
  all 200 Election Day rows and on 20 of the 21 absentee rows; Olivette City Center (614)
  has none. The data health check (`scripts/check-config.mjs`, "polling place rooms")
  warns with the count of places and sites that have no room.
- The layer is named per election, like the polls layer: `layers.pollRooms` in
  `src/config/election.js`.

Not used: the rest. Turnout by site is not something voters need, and `PHOTO_URL` could be
a later nice-to-have for finding the entrance.

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

The wait times page lists both boards' sites (#91), each row naming the board that runs it, since
each board's sites are for its own voters (a County voter votes absentee with the County board,
a City voter with the City board). Its "Line counts checked at" line says the counts are
unavailable when either board's cannot be loaded. A City precinct's early voting card asks the
City's wait time layer only, through its own loop on the same rules.

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
  view filter also keeps only `abs%` reports. So the County must change the view (or
  publish another) before any Election Day count can show, and its own app's popup too.
  This app is ready (#107): `waitTimes.county.electionDay` in `src/config/election.js` holds
  the layer, filter and join field (`username`), so pointing at a new view is a config change.
  Until then every County polling place shows no count. No Election Day report has been
  recorded, so the Election Day fixtures (`asElectionDay` in `src/data/waitTimes.fixtures.js`)
  are the early voting recordings moved to Election Day morning, the County's renamed to
  each site's `username`; the browser tests' City rows instead keep each recorded count and
  report it at 8:50 a.m. on Election Day (`e2e/fixtures.js`).
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

The home page's line count dot map (#184) draws this outline and the City's
(City boundary, below) from a committed module,
`src/features/waitTimes/outline.js`, which `node scripts/build-outline.mjs`
writes: it asks each layer for its first feature's outline (`outSR=4326`,
GeoJSON), simplifies it with Douglas-Peucker (0.6 view units), projects it
(longitude scaled by cos(38.6 deg), latitude as is) into a 300 x 300 view and
rounds to tenths. On 2026-10-23 the County ring had 7,321 points and the City
ring 326; the module is about 1.4 KB gzipped for both. The County outline leaves
the City out, so a City point falls outside it (`outline.test.js` checks known
points of each). The daily data health check runs `--check`, which rebuilds the
module and fails when it no longer matches the committed one.

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
failed), or coordinates alone or a place the geocoder puts in the county, near the City, west of its river edge
(`eastOfCity` in `locate.js`, #144) and not known to be in the county (the
boundary says outside, or cannot answer) when the City's layer failed, is sent to the City's Board of Election Commissioners and its polling place lookup,
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
its postcode and a town typed after the street (with or without a comma) its town (for a
county address record, its mailing city or its community, `MSAG_COMMUNITY_NAME`),
unless it is St. Louis (units such as "Apt 2", the state, the country and numbers are
not part of the town, a direction is ("East St. Louis" is not St. Louis), and "St. Louis
City" must be a City result); and a result in a named
town other than St. Louis needs that town (for a county record, its mailing city or
community) or its ZIP typed, because the same address
can exist in two towns ("St. Louis" is the mailing city for much of the county, so it
confirms nothing). A typed ZIP needs a result postcode, unless the result's mailing
city is a named town other than St. Louis and that town (or, for a county record, its
community) is typed too, and when matching results are not one address (same
county, and the same postcode or within about 50 m), the answer is no match rather than
Photon's first pick.
Typing a suggestion's own label back always matches. So the Galleria (Photon's answer is 1155, the mall, not 1417)
gives no match instead of a nearby building. Photon also answers "8025 Maryland Ave"
with 8025 Bonhomme Ave, which the check turns into no match. Neither apartment
address above is in OpenStreetMap; both give no match. A no match tells the voter
to add the ZIP, pick a suggestion, try "Use my location" or use either board's official
lookup (#93).
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
- **Typed community:** a typed town also agrees with a record's community,
  `MSAG_COMMUNITY_NAME`, both where a typed town must agree and where a named town needs
  its town or ZIP typed (41 S Central Ave 63105 is mailed Saint Louis, community Clayton,
  so "41 S Central Ave, Clayton" finds it, #143; a record's `&` reads as AND, so a typed
  "Town and Country" matches TOWN & COUNTRY, while a typed `&` is dropped like other
  punctuation and does not). It is the emergency-services community and can differ from the
  record's `MUNI` code (a `LADUE` community with `MUNI` `CLY`); only the community name is
  compared. A value that starts with ST LOUIS or ends in COUNTY (`ST LOUIS COUNTY`,
  `ST LOUIS CITY`, `JEFFERSON COUNTY`) is not a town. The community can differ between the
  records of one address, so with a town typed and no ZIP every record of each matching
  address stays in the pool for the unit pick and the one-precinct check below; when that
  town is St. Louis City, only the City records it matched stay, as before. A typed unit is
  taken only on the side of the City line the text matched, with or without a ZIP.
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
  to "Use my location" and both boards' official lookups (#93), or can type the unit. A failed
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
  63133, 63136, 63120, 63147 and others) or is not listed gets the check. Under #58 the
  ZIP in a picked suggestion's label was ignored, as the county record's and not the
  voter's. Since the owner's decision of 2026-10-22 (#88) it counts as typed: the City's
  63112 parcel of `6135 Washington Ave` is suggested after the county's 63134 record, each
  label names its jurisdiction ("St. Louis City" for the City's), and a pick opens the
  precinct of the jurisdiction its label names, so a pick of the county's label (a
  county-only ZIP) skips the check and opens the county precinct.
  After a pick, every search goes as a pick (`src/features/lookup/AddressSearch.jsx`)
  until the voter deletes or changes the label's ZIP (owner decision, 2026-10-21): editing
  other parts of the label (adding or pasting a unit, deleting ", MO", a space) keeps it.
  Pasting over a selection that holds the ZIP replaces it, and an autofill (an edit with no
  input type) forgets the pick, since the box cannot tell what it replaced. A digit left
  against the ZIP when the voter searches makes it another number, so that search goes as
  typed text; deleting the digit makes it a pick again. Under #58, forgetting the pick made a ZIP typed later the voter's own, so a
  county voter could still type a county-only ZIP to get the precinct. Since the label's
  ZIP counts as typed (#88), a pick and the same text typed get the same answer, so the
  pick tracking no longer changes the answer.
- **A City match:** a `PointAddress` (a City parcel; interpolated `StreetAddress` ranges do
  not count) with the typed house number and whole street under the strict rules
  (`matchesStreet` in `addressMatch.js`), and the typed ZIP when one is typed (a parcel
  with no ZIP is found, but gives no match, as the twin rules below say). The answer is
  that City place, so the voter gets the City precinct (#88; the City referral before it),
  never the county precinct. A typed town does not rule a City parcel out.
- **The county and the City list the address in one ZIP** (the City parcel's ZIP is the
  ZIP of the place found: 6135 Horton Pl 63133, county UNV202; 1 Brookings Dr 63130,
  Washington University, county HAD018): no match, since the lookup cannot tell which one
  the voter means (owner decision, 2026-10-21). The voter is pointed to "Use my location"
  and both boards' official lookups (#93).
- **The county and the City list the address in different ZIPs** (6135 Washington Ave:
  63134 in the county, FER022; 63112 in the City), owner decision of 2026-10-22 (#88):
  text with no ZIP (`6135 Washington Ave`, `6135 Washington Ave, St. Louis, MO`) is no
  match, whose message asks for the ZIP, never either precinct. The City's ZIP typed gets
  the City precinct, and a county-only ZIP the county precinct. A pick opens the
  jurisdiction its label names: the county's label the county precinct, the City's label
  ("St. Louis City", 63112) the City precinct. The locked #58 tests that expected the City
  place for text with no ZIP and for a pick of the county's label were rewritten with the
  owner's approval. A place found with no ZIP of its own (a Photon answer without a postcode)
  whose number and street the City has is no match too: the two cannot be told apart.
- **A City parcel the text could mean but not exactly** (its street has a direction the
  text left out, like `1200 Market Pl` and the City's 1200 N Market Pl): no match.
- **The City geocoder unavailable** (network error, non-2xx, error body, malformed body,
  or no answer in 4 s): never the county place. Without `reportUnavailable` it is no
  match; the app passes it (#18), so the voter is told address search is not working,
  with Try again, "Use my location" and both boards' official lookups (#93).
- **Cost:** a voter whose number and street the county and the City list in different
  ZIPs and who types no ZIP is asked for one (since #88; under #58 that text got the City
  referral). Typing a ZIP, or picking the suggestion that names their own jurisdiction, gets
  their precinct. A City geocoder outage makes every lookup without a county-only ZIP whose
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
  `COUNTY_ONLY_ZIPS`, or any ZIP not starting 631, as every City ZIP does) typed by the voter
  is never sent, nor is a pick whose label holds one (since #88 a label's ZIP counts as
  typed).
- **Labels:** a City place and suggestion read `<number> <street>, St. Louis City, MO
  <ZIP>`, so a City address reads apart from its county twin, whose label names its own
  town. A picked City label fails the county's strict rules (it names the City), so it is
  found again by the City, unless the county lists the address in the same ZIP (no match,
  #58). Typed text with no ZIP that the City finds is asked of the county again by its
  street alone, since a typed "St. Louis City" rules out every county record: a county
  record with that number and street, in any ZIP, makes it no match (the twin rule above),
  and a county that cannot answer then is no match, or address search not working.
- **Suggestions:** the geocoder has no suggest operation and matches whole words only, so
  it is asked with `findAddressCandidates` once a house number and a street word of two or
  more letters or digits are typed (`12th`, `Oz`; not a lone `W`), and its parcels whose number and street start with the typed words
  (the last as a prefix) are shown after the county's, at most 5. `5010 Notting` gets no
  City suggestion; `5010 Nottingham` does. A failed City request adds none, and none are
  shown while no county source answers, since a pick could not then be found again.
- **The City geocoder unavailable:** Photon is asked; a Photon place that could get a
  county precinct still needs the City check, which fails too, so never a county
  precinct. A Photon place named as the City, for text with no ZIP, is asked of the county
  by its street, as a City lookup answer is (`1 Brookings Dr, St. Louis City`: the county
  has it, so no match, not the precinct at its point). With nothing found, `reportUnavailable` (#18) makes it address search not
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
that City Hall (1200 Market St, 63103) and the #58 City address with its ZIP (`6135
Washington Ave, St. Louis, MO 63112`) open a City precinct (the City referral before #88),
typed and picked from the City's suggestion, that the #58 twins typed with no ZIP (`6135
Washington Ave, St. Louis, MO`, `6135 Washington Ave`, `6109 Washington Ave`) are no match
and picked from the county's suggestion open the county precinct (owner decision,
2026-10-22) (rerun 2026-10-22: City Hall W14P02, `6135 Washington Ave` 63112 W10P02, `5010 Nottingham Ave`
W05P05, `6500 Chippewa St` W02P01, `8900 Riverview Blvd` W13P11; St. Charles, Washington DC
and Philadelphia addresses get no precinct), and that addresses both list in one ZIP (`6135
Horton Pl, St. Louis, MO 63133`, `1 Brookings Dr`, `1 Brookings Dr, St. Louis, MO 63130`,
and the `1 Brookings` pick) are no match, with the live layer and with it blocked: all do.
Rerun 2026-10-24 after #198 (the script had read every City address as the City referral,
as plain Node could not load the City chunk's `.jsx` files; it now gives `locate()` the City's
data module): app and live blocked 11 right of 11 each, every City address and City pick the
City precinct above (City Hall W14P02, `6135 Washington Ave` 63112 W10P02, `5010 Nottingham
Ave` W05P05, `6500 Chippewa St` W02P01, `8900 Riverview Blvd` W13P11), exit 0.
A random sample of 192 current county address points, each typed both as stored
and as a person would (lower case, full street type, town and ZIP), matched in the
live layer every time.

The county web map also has a `commercial_addresses_view` layer that warns when
an address is commercial, not residential. Worth a later look as an optional
check.

## Basemap

Choice (issue #13): OpenFreeMap's Positron style,
`https://tiles.openfreemap.org/styles/positron`, drawn with MapLibre GL JS; in dark mode (#77)
its Dark style, `https://tiles.openfreemap.org/styles/dark`, which uses the same sprite, glyphs
and tiles and whose fills, lines and labels are all grays (checked 2026-10-23). Free, with no
API key or account; its terms (openfreemap.org/tos, updated 2026-10-14) allow embedding it in
a website. Style, TileJSON, vector tiles, sprites and glyphs all come from
`https://tiles.openfreemap.org`, served through Cloudflare. Attribution: OpenFreeMap,
OpenMapTiles, OpenStreetMap contributors. Tile requests reveal the area on screen to OpenFreeMap and
Cloudflare: the precinct plus its nearest polling places, which depend a little on the
searched point within the precinct (and widen on "Show more"). No address or coordinates are
sent as such. The map
is extra help only: precincts and polling places still come from the board's own layers (the
County's above, or on a City precinct's page the City Board's, under St. Louis City below, #89).

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
  `src/` (comment lines and tests may name them). Sources retired with it: the FAQ (its "vote at
  any polling place" line is now on the board's Polling Places page, #152; the Election Day
  hours), the Contact Us page (the phone number,
  office address and hours) and the Registration page.
- The board's `.gov` domain, `stlouiscountymovotes.gov`, still answers `301` to
  `https://stlouiscovotes.info/`, which then refreshes to the page above: two hops. Link the
  page directly. `stlouiscovotes.gov` (from the project brief) does not resolve.
- The page answers `403` to scripts (curl, WebFetch, headless Chromium): a Cloudflare bot
  challenge. Browsers load it. Check links to it by hand in a browser, and do not cite its
  text unless someone has read it there (the Election Day rule's quote was, on 2026-10-22, #152). The daily content link check reports it as a skip
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
nearby polling places, the county site URL, moved in #73) and in issue #152 (the Election Day polling place
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
(#87), loaded on demand through `loadCityClient()` in the City chunk (`src/cityChunk.js`, #147),
with the City-only results UI and `src/config/cityResults.js`, the values only the City's cards
read (its early voting hours, #91, its Election Day rule, #89, its districts card's rows, #90,
and its sample ballot, #92). The City adapter (#89, #91)
reads the precinct, its outline, the Election Day voting locations and the early voting sites
through it.

## St. Louis City

Checked live on 2026-10-22 for #87, which settles the layer questions #87 needed from #57:
the Election Day list and its filter, the early voting sites, the City boundary, and districts
for a precinct. One #57 question stays open: what the City page's Assigned Polling Place Lookup
calls (the layers assign no polling place to a precinct, below). The U.S. House "First
District" question is settled below (Districts, #90). The
City client is `src/data/cityArcgis.js`, with the same request rules as the County client
(plain fetch, one retry, coordinates only in a POST body). The layers, fields and filters are
in the City block of `src/config/election.js`; `node scripts/check-config.mjs` checks them
(Data health check in the README), and `node scripts/record-fixtures.mjs city-` re-records
their fixtures (`docs/raw/fixtures/city-precinct-*`, `city-districts-*`, `city-polls`,
`city-early-voting-sites`, `city-boundary-*` and `city-outline`, #144) along with the City
geocoder's (`city-geocode-*`, #58); when a new `city-outline` fails the river edge test in
`locate.test.js`, redraw `RIVER_EDGE` in `src/features/lookup/locate.js` from it; the City
wait fixtures are recorded by hand (Wait times above).

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

### Sample ballot (issue #92)

The City's precinct layer has no sample ballot field, and the City Board publishes no ballot per
precinct or ward. It publishes one PDF for all precincts,
`https://www.stlouis-mo.gov/government/departments/board-election-commissioners/documents/upload/Nov26-All-Races-Sample-Ballot.pdf`
(supplied by the owner on 2026-10-23; HTTP 200, `application/pdf`, 1,889,321 bytes,
Last-Modified 2026-09-14). Its first page reads "Sample Ballot, General Election, City of St.
Louis, November 3, 2026, All Precincts", and it holds every contest in the City: each State
Representative district, for example. The City Board's Elections page
(`.../board-election-commissioners/elections/index.cfm`) lists "11/03/26 General Election"
with a "Sample Ballot" link to it. Neither page says which races a voter sees, so the card says
plainly that this is the City's ballot for all precincts and that the voter's own ballot has
only the contests for where they live. This ballot has no ward (aldermanic) contest, so the card
does not say a ward contest is on it. It never calls it the voter's precinct ballot, and
never reads a precinct's data to pick it. The URL is `sampleBallot` in
`src/config/cityResults.js`; `node scripts/check-config.mjs` checks it answers HEAD with a PDF.
The County's per-precinct match (#82, #111) has nothing to match on a citywide ballot.

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
distinct `districtid` values). The `electedoffice` field's coded values also include party committee posts,
`Committeeman (R)`, `(D)`, `(L)`, `(C)`, `(G)` and the same for `Committeewoman`: no row has
one on 2026-10-22, but a card must never show such a row's office, which names a party. The statewide and some district polygons reach past the City line (the
county point -90.33, 38.62 gets 9 rows, among them Missouri Senate District 4), so a districts
answer is never the test of being in the City: the precinct and boundary queries are. The app reads `electedoffice`, `district` and
`districtid` only. The layer also holds each officeholder's name, photo, party and contact
details (`repname1` to `repname7`, `repimageurl*`, `party*`, `districturl*`, `phone*`,
`email*`, `facebook*`, `twitter*`, `fulladdr*`); the app never asks for them (a test fails if
it does), and never asks for `*`. `electedoffice` names the office as its holder is styled
(`Alderman`, `Alderwoman`), so the districts card labels the district, not the office.

**The districts card (#90)** lists six rows, in the order and with the `electedoffice` values
`districts.rows` in `src/config/cityResults.js` names: U.S. House (`United States House of
Representatives`), State Senate, State House (`State House Representative`), Ward (`Alderman`
or `Alderwoman`), Community college subdistrict (`St. Louis Community College Trustee` on the
rows; the field's coded values say `Community College Trustee`, so both are read) and School
district (`Board of Education of the City of St. Louis`). Each shows the row's `district` text
as published ("Ward 14", "Missouri House District 78"), never the office. The citywide and
statewide offices are the same for every City voter and the County card has no such row, so
they are left out, as are the two placeholders and any party committee office; a value that
names a party is dropped too. The card asks with `getCityDistrictsForPrecinct` (below), never
the voter's own point; if an answer ever has two values for one row, it lists both and says so.

**U.S. House "First District"** (#90, settling the #57 question). The whole City is in the
first congressional district under the 2022 map (RSMo 128.461, "County: St. Louis City MO",
with no VTD or block list) and under the 2025 map in H.B. 1 as truly agreed (its section
128.471, the same line). The Revisor's note on RSMo 128.346, read on 2026-10-22, says the
Missouri Supreme Court found the H.B. 1 referendum petition sufficient on 2026-09-03 (Glahn v.
Hoskins, No. SC101805), so H.B. 1 does not take effect unless voters approve it, and the 2022
districts stay in effect for the November 2026 general election. The layer's single "First
District" polygon is right under either map, so the card shows the row. Recheck when the map
changes. The County card reads the 2022 field, `congressional_district_20` (see "Which
congressional map (#150)" under Precincts).

**Districts for a precinct** (the districts card asks this way on every City page, after a
lookup too, so the voter's own point never goes to the districts layer): `BOE/PRECINCTS_2023`
on `maps6.stlouis-mo.gov`, which has `Ward`, `Senate`, `Rep` and `NewCC` on each precinct, still
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
`fulladdr` (no ZIP in it), `pollingPlaceZipCode`, and the entrance notes `entrydetails` and
`disabledentry` (below). Never `*`: it also holds staff contact
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
  no ZIP there. `accessible` is empty on every row, so the app does not read it;
  `disabledentry` and `entrydetails` are filled on all 57, and the polling places card shows
  them as published (#89, the config's `siteFields.accessibleEntry` and `entry`): short notes
  like "off parking lot accessed from Vista Ave.", from the layer's current rows (all with
  `nextelectdate` 2026-11-03). The names and addresses are published in mixed case, so the card keeps
  them as published (the County's all-caps text is title-cased); the notes are always shown as
  published. `imageurl` and
  `boxlocdesc` are not read yet (#146).
- **Early voting sites (`earlyVotingWhere`):** `publicview = 'Yes' AND earlyvoting = 'Yes'`,
  the owner-confirmed wait time filter: 8 sites, the page's 8 No Excuse Absentee sites (Buder,
  Carpenter, Julia Davis, Kingshighway, Schlafly and Walnut Park libraries, St. Joan of Arc, and
  the Board office). Their `earlyvotingoperhours` match the page's hours, except that the Board
  office's `Mo-Fr (08:00-17:00)` leaves out the page's "Last Saturday Before Election Day: 9
  AM-1 PM". The text is hand-typed and uneven (a stray `)`, missing spaces), so the app does not
  parse it for the hours it shows (#91): `earlyVoting` in `src/config/cityResults.js` holds each
  site's hours by weekday, from the page (re-read 2026-10-22: the Buder, Schlafly and Julia Davis
  libraries Monday 1 to 4 p.m., Tuesday 11 to 5, Wednesday and Thursday 11 to 7, Friday and
  Saturday 11 to 4:30; the Carpenter, Kingshighway and Walnut Park libraries the same but 11 to 5
  Tuesday to Thursday; St. Joan of Arc as Buder, October 27 to November 2 only; the Board office
  weekdays 8 to 5 and Saturday, October 31, 9 to 1; all closed Sundays), and the dates from the
  City Board's No Excuse Absentee page ("the two weeks prior to each election": October 20 to
  November 2), which match the layer's `earlyvotingstartdate` and `earlyvotingenddate`. Only
  the wait time selection reads `earlyvotingoperhours`, to show a count only while a site is
  open, as the City Board's dashboard does. `node scripts/check-config.mjs` fails while a site the
  filter returns has no hours in the config. The City early voting card and the wait times page
  show these sites; the card cites the No Excuse Absentee page rather than stating who may vote
  this way, and for voting by mail links the absentee topic, which has a City section (#94,
  #168), and the City Board's Apply to Vote Absentee page
  (`.../voter/absentee/vote-by-absentee-ballot.cfm`, which covers both ways to vote absentee;
  the No Excuse page says it has no mail option).
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
The first row by `OBJECTID` is the outline the home page's dot map draws (#184; County
boundary, above).


## Service inventory

Every service in the two ArcGIS orgs the app reads, and in the City Board's folder on the City's
GIS server, with why the app uses it or not (#101), so the next election's inspection does not
repeat the work and nobody adds a layer that was ruled out for a reason. The service lists were
taken on 2026-10-24; each table row has its own check date.

- County: `https://services6.arcgis.com/wkbq75VVf2MvUvs7/ArcGIS/rest/services` (223 services)
- City: `https://services6.arcgis.com/HZXbCkpCSqbGd0vK/ArcGIS/rest/services` (159 services; the
  whole City government's org, not only the City Board's)
- City Board folder: `https://maps6.stlouis-mo.gov/arcgis/rest/services/BOE` (2 services)

`node scripts/inspect-data.mjs` starts by listing all three and printing every service this file
does not mention; `--inventory` does only that and writes nothing. A service counts as mentioned
only when it is a line of a ```` ```services county ````, ```` ```services city ```` or
```` ```services boe ```` block in this section (the blocks for its own root), one name per
line, where `*` matches any characters. Code spans do not count, here or elsewhere in this
file: many are field names, which would hide a new service of the same name. So a service the
tables below give a reason for is also listed in its root's "Named in the tables above" block.
A root that answers with an error, or with no services list, is a `fail` line, not an empty
org. Before each election, run it and add each new service here: a reason in a table or a
block's summary, and its name in the right block (README, Updating for a new election). Never
use a family pattern like `polls_*`, `*_view` or `BOE/*`: the script ignores only a pattern
with fewer than 4 characters besides `*`, so these would hide the next election's
`polls_YYYY_MM_view` or every new service in a root.

The inventory step reads only the directory listings. It never queries a listed service or reads
its metadata: some are the Board's forms and hold voters' personal data. What each opaque
`service_*` and `survey123_*` service is came from its public item title in the org's content
search, not from the service.

### Read by the app

| Service | Org | What the app reads | Checked |
|---|---|---|---|
| `precincts_2026_11_view` | County | Precincts, sample ballot links, districts (Layers, above) | 2026-10-24 |
| `polls_2026_11_view` | County | Election Day polling places and in-person absentee sites (Layers, above) | 2026-10-24 |
| `St_Louis_County_Boundary` | County | The County outline (County boundary, above) | 2026-10-24 |
| `November_3_2026_Polling_Places_Dashboard_view` | County | `ACTIVE_ROOM` only (Polling place rooms, above) | 2026-10-24 |
| `Voters_in_Line_View` | `IeWM0VelvUwce9qE`, a third org | County early voting line counts (Wait times, County, above) | 2026-10-24 |
| `ElectionGeography_public_4533ffc5e0c84851a35cc97e64bb160a` | City | Layer 1 precincts, layer 2 districts (names and numbers only) and the City outline (St. Louis City, above) | 2026-10-24 |
| `VotingLocations_currentwait_4533ffc5e0c84851a35cc97e64bb160a` | City | The 56 Election Day sites, 8 early voting sites and City line counts (St. Louis City and Wait times, City, above) | 2026-10-24 |
| `Maps/ASR_Address_Points` on `maps.stlouisco.com`, then `Address_Points` on `services2.arcgis.com` | St. Louis County government | Address search (Geocoding, above) | 2026-10-24 |
| `GEOCODERS/COMPOSITE_GEOCODE` on `maps6.stlouis-mo.gov` | City | City address search and the City check (Geocoding, above) | 2026-10-24 |

"Checked" here means the layer answered its `?f=json` with the expected name on that day.

### Reviewed and not used: County

Org `wkbq75VVf2MvUvs7`.

| Layer or field | What it is | Why not | Checked |
|---|---|---|---|
| `Polling_Places_Attachment_Gallery_view` layer 34, attachments | Photos of polling places (758 rows across years, some with 6 attachments: building photos and screenshots) | Unreviewed internal photos; some may show people or interiors. Not without the Board's say. | 2026-10-21 |
| `PHOTO_URL` on the dashboard and gallery layers | Portal images titled `TurnIn1`, `Turnin2` (20 distinct across 221 rows) | Internal turn-in route images, not building photos. | 2026-10-21 |
| `Muni_Poly_Jan2026_view` `URL` (and its source, `Muni_Poly_Jan2026`) | One link per municipality (88) | Links go to mayors' pages or Wikipedia: officeholder pages, not election information. | 2026-10-21 |
| `commercial_addresses_view`, `usps_ups_view` | 65 commercial mailbox addresses (`Postal Box Address`, UPS Store) and buffers | For registration checks at the Board, not for finding where to vote. | 2026-10-21 |
| `Table_Voter_Curbside_CheckIn` | Curbside check-in table with voter name, address and vehicle fields | Voter personal data. Never query it. | 2026-10-21 |
| `11_3_2026_Precincts`, `11_3_26_PollingPlaces` | Source layers behind the two views the app reads | Same data. `notes` and `countywide` are blank. | 2026-10-21 |
| `Municipality_Wards_Jan2026_view` (and its source, `Municipality_Wards_Jan2026`), `Zip_Codes_StLouis_County` | Ward and ZIP polygons | The precinct already carries its ward; ZIPs are from 2023. | 2026-10-21 |
| `November_3_2026_Precincts_Dashboard_view` (and its source, `November_3_2026_Precincts_Dashboard`), `Party_Ballot_By_Precincts_view`, the `Absentee_Turnout_*` and `November_2020_Gubernatorial_Turnout_*` services | Turnout and primary ballot counts | Turnout is out of scope (`November_3_2026_Precincts_Dashboard_view`, above). | 2026-10-21 |
| `sat_name_export_2026_11`, `2026_11_abs_ballot_app_precincts_view` | Internal absentee site codes; the absentee application map's precincts | Already covered by the layers the app reads (their sections, above). | 2026-10-20 |
| `lookup_view_abs`, `lookup_view_polls`, `lookup_view_precincts`, `lookup_view_sample_ballot` | Names that look current | They point at 2024 data (Legacy `lookup_view_*` services, above). | 2026-10-20 |
| `Polling_Places_Lookup_View` | "The shared polling place layer for the BOEC Mapping Department" (its item description) | A working layer, not an election's published view; the app reads `polls_2026_11_view`, which the Board's own lookup app uses. | 2026-10-24 |
| `US_Congress_2025_view` | The 2025 congressional map (H.B. 1) | The precinct carries its congressional district, and which map is in effect is `congressionalMap` in the config (Precincts, above): the 2022 map for November 3, 2026 (#150). | 2026-10-24 |
| Older dated services (`11_4_2025_*`, `precincts_2025_*`, `lookup_view_*_2024_11` and the rest) | Past elections | Stale. Listed by name in the first block below. | 2026-10-21 |

The rest of the County org, listed 2026-10-24:

<details>
<summary>Named in the tables above (26)</summary>

The County services the "Read by the app" and "Reviewed and not used: County" tables give a reason for.

```services county
11_3_2026_Precincts
11_3_26_PollingPlaces
2026_11_abs_ballot_app_precincts_view
commercial_addresses_view
lookup_view_abs
lookup_view_polls
lookup_view_precincts
lookup_view_sample_ballot
Muni_Poly_Jan2026
Muni_Poly_Jan2026_view
Municipality_Wards_Jan2026
Municipality_Wards_Jan2026_view
November_3_2026_Polling_Places_Dashboard_view
November_3_2026_Precincts_Dashboard
November_3_2026_Precincts_Dashboard_view
Party_Ballot_By_Precincts_view
Polling_Places_Attachment_Gallery_view
Polling_Places_Lookup_View
polls_2026_11_view
precincts_2026_11_view
sat_name_export_2026_11
St_Louis_County_Boundary
Table_Voter_Curbside_CheckIn
US_Congress_2025_view
usps_ups_view
Zip_Codes_StLouis_County
```

</details>

<details>
<summary>Past elections' precincts, polling places, dashboards and lookup views (89)</summary>

Every one is for an election before November 3, 2026, so it is stale for this one: its name or
item title names that election, or (`ad7f60`, `PrecinctsDemo`, `survey_view_precincts`,
`lookup_view_polling_places`) its item was last changed in 2024 or earlier.

```services county
11_3_2020_Polling_Places
11_3_2020_Precincts
11_4_2025_Polling_Places
11_4_2025_Precincts
11_5_2024_Polling_Places
11_5_2024_Precincts
11_7_2023_Polling_Places
11_7_2023_Precincts
11_8_2022_Polling_Places
11_8_2022_Precincts
4_2_2024_Polling_Places
4_2_2024_Precincts
4_4_2023_Polling_Places
4_4_2023_Precincts
4_5_2022_Polling_Places
4_5_2022_Precincts
4_6_2021_Polling_Places
4_6_2021_Precincts
4_7_2026_Polling_Places
4_7_2026_Precincts
4_8_2025_Polling_Places
4_8_2025_Precincts
8_2_2022_Polling_Places
8_2_2022_Precincts
8_5_2025_Polling_Places
8_5_2025_Precincts
8_6_2024_Polling_Places
8_6_2024_Precincts
Absentee_Turnout_240806_BY_LOCATION
Absentee_Turnout_240806_BY_LOCATION_view
Absentee_Turnout_241105_BY_LOCATION_view
Absentee_Turnout_250408_By_Location_view
ad7f60
April_2023_Voter_Precincts
April_7_2026_Polling_Places_Dashboard_view
April_7_2026_Precincts_Dashboard_view
April_8__2025_Polling_Place_Proposal_WFL1
April_8_2025_Polling_Places_view
April_Precincts_View
April2024_PollingPlaces_view
April2025_Dashboard_Precincts_view
August_2024_Precincts_view
August_2025_Contests_view
August_2026_Precincts
August_4_2026_Polling_Places_Dashboard_view
August_4_2026_Precincts_Dashboard_view
August_4_2026_Primary_Election_Polling_Places
August_6_2024_Absentee_Satellites
August_6_2024_PollingPlace_UnderConstruction
August_6_2024_PollingPlace_UnderConstruction_view
August2024_PollingPlaces_view
lookup_view_polling_places
lookup_view_polling_places_2024_11
lookup_view_polling_places_2025_04
lookup_view_sample_ballot_2024_11
lookup_view_sample_ballot_2025_04
November_2020_Gubernatorial_Turnout_by_Precinct
November_2020_Gubernatorial_Turnout_Precinct_Layer
November_4__2025_Dashboard_Polling_Places_view
November_4__2025_Dashboard_Precincts_view
November2024_Dashboard_Polls_view
November2024_Dashboard_Precincts_Gubernatorial
November2024_Dashboard_Precincts_view
Polling_Places_2024_view_for_august_preview
polls_2023_11_view
polls_2025_08_view
polls_2025_11_view
polls_2026_04_view
polls_2026_08_view
Precincts_2022_0201
precincts_2023_06_lookup_view
precincts_2023_08_view
precincts_2023_11_view
precincts_2024_04_12_view
precincts_2024_08_abs_app_view
precincts_2025_04_view
precincts_2025_06_view
precincts_2025_08_view
precincts_2025_11_abs_app_view
precincts_2025_11_view
precincts_2026_04_ballot_app_view
precincts_2026_04_view
precincts_2026_08_view
Precincts20210319
PrecinctsDemo
St__Louis_County_Polling_Places_by_District_WFL1
survey_view_precincts
under_construction_polls_Nov2024_view
Voter_Precincts
```

</details>

<details>
<summary>District, municipality, census and redistricting layers (44)</summary>

The app takes a voter's districts from the precinct's own fields (Precincts, above), not from a
separate district layer, and these are either older lines or a working copy for redistricting.

```services county
census_2020_stlco_blocks
Census_Block_Data_on_Wards_WFL1
Census_Population_Change
Compromise_Map
Compromise_Map_in_ESRI_Redistricting
Council_Districts_2010_view
Districts
Junior_College_Districts
Muni_poly_May2025_2_view
Muni_poly_May2025_view
Muni_Poly_Sept2025_view
Muni_Wards_April2024
Muni_Wards_February2023
Muni_Wards_Nov2024_view
Municipal_Wards_September_2022
Municipalities_2025_V1_view
Municipalities_Feb_2023
Municipalities_Nov_2023
Municipalities_Nov2024
Municipality_Wards
Municipality_Wards_May2025
Municipality_Wards_May2025_2_view
Municipality_Wards_May2025_view
Municipality_Wards_Sept2025_view
Muny_Wards_May_2022
NewHouse
Old_Townships
Old_US_Congressional_Lines
Proposed_Townships
Saint_Louis_County_Council_District_Plan_view
Senate_Districts_2022
Sewer_District
St_Louis_County_Council_Districts
St_Louis_County_Jurisdictions_v3_WFL1_View_view
State_Representative_2012
State_Representative_2022
State_Representative_Districts_2022
State_Senate_2010
STL_County_Council_District_Plan
STL_County_Council_Districts
Townships2020_WFL1
US_Congress_2022_Lines
US_Congress_Comparison_Map
US_Congressional_Districts_Aug_2022
```

</details>

<details>
<summary>The Board's forms and their results (64)</summary>

Survey123 and form services, by item title: absentee ballot applications, poll confirmations,
election judge applications, post election surveys, incident reports and the like. They hold
voters' or election workers' personal data. Never query them; they are listed here by name only.

```services county
service_0000cc9a8b85436788ad0be755ae96e7
service_1dddb16da7604864bf6d8329ee88f9e7
service_2204306f444e46b38278d63863cb4c92
service_3006a574eb3c4b50a2253a9c0b08820e
service_3451029f08c544778ae7d82e8789891c
service_34e01cea63c94a9f9c1ab4cf9cf36daa
service_3a1d4acc1d684b3a913a451588164996_form
service_416e8e48484d47ffa027bec8bf8a4daf
service_41eb61b46b5d4e269ec831cb5848bb9d_form
service_42ba76aaa23048d89522bf80d7afba63_form
service_48087d1c4f524993befd52ae7afc5664
service_573c64ee589c4fb99b7484ab3745c7dd
service_5955c6d48a504d84809b0a01441d8ead
service_63b222ef948c4177920b6dd14bcd5e0f
service_67baf1b769ec402c98090a963ed839b3
service_7b0adac41f3544508bb049d9c81a97b3
service_809025c794ad419681d17282ce335390
service_8370971febaf4c32afb97097fb0c00ef_form
service_83928e5534384a5c84efa473a0014936
service_85e35dfd8a9f454388d5661bf59a5755_form
service_8b3dca02e0ee4275953d13f4403b552e
service_957ce5f154fc4971b9497af99ea1ae63
service_9975626e799e4194a98c020515327a97
service_9e63168137c24633a90c2573e4926a97
service_b40004b293bf4f3caced851c22b5082c
service_b5d9ee3919f840dabadfed9dc1819b24
service_b62c2bd0add14ff99ed57c37aed15507
service_bf8effae0b0b4e45aa7067ed1a4ffe61
service_c3e4acfd6fd44ed0b612d251252c9abc
service_c75c01fa1b93431595db5ed5fb860f11_form
service_c8b221a2957148009d43b9b0b277c020
service_cd3f0c4e247f479aa321a8378986ab27_form
service_cf6f3fb7a24d432f886fcf68460354d7_form
service_cf843d2be0b44a8eb2ef208aacfbdb99
service_d4965c3a6a77469da58cacbbee404010_form
service_d4eb35bba53c4213a84bc59158f799a5
service_d8bc516d3f1c42dbaddc9f94f800405c
service_da6bce7a0ee5421aaf0f5fcec4f7b14c
service_dd7667242f4a4fc588c622a28b8c6797_form
service_e27983fc3ed1423596553852232aa921_form
service_ead1d0e292ee40f28f23a440b06dbeb7
service_ec825ac6de1440e3bed89c4123497204_form
service_f25e008224cd48078c041b143cae2feb
service_f4b10636538742768e85494f350671d6
service_f63f8a0d560549af8402ecc2d1833d97
service_fb4a073920204d15827801810a6c2853
service_fd927d3bfc574941b85487faffcf1aa9
survey123_0aa559bd85e544b9a8da5bcb7ce3058d
survey123_329548c31b814410b706bb2e2f530c82_form
survey123_3889d09d551e40d2b0689ea595e012dd
survey123_3f53aa1ee0da4efd83b9e37f8d4ab101_form
survey123_48bf956ef40844de9ff7f05639e1ed66_form
survey123_52005b4d1d9f4ba2b5f27cc4c0c1f3ab_fieldworker
survey123_5394cb2dc1dc4647b98b2fb1a503bbe3_form
survey123_870a0cc2a2604de2b7e2b2344d19d4b1_form
survey123_8dd95b7a0a1d4a1d8d4e9e931d864b25_form
survey123_96ddc38ce6744da897c0af56f7e778b8
survey123_ac0b6de6eda843cabb32e21fd1e4c075_form
survey123_c465f16e878543ebbc0d0ada13698d06
survey123_c7d63db2a28a495ca22145a1535a4646_form
survey123_d3b53e19db6e41c483ab2f9d6c0e1bbe
survey123_da592dad09784ad8a2a640b5febbe96f_form
survey123_e03696cd860f4b2f94add7f656b6390e
survey123_f16c078af64841e9b206bc85ea7e3d90_form
```

</details>

### Reviewed and not used: St. Louis City

Org `HZXbCkpCSqbGd0vK` and the City Board's folder on `maps6.stlouis-mo.gov`. The fuller findings
are in the St. Louis City section above and in #57's comments: the
[closing comment](https://github.com/GeoBradDev/MapTheVoteSTLCounty/issues/57#issuecomment-6363869071)
answers each of its questions, and the
[`maps6` BOE comment](https://github.com/GeoBradDev/MapTheVoteSTLCounty/issues/57#issuecomment-6329041308)
covers the City Board's own GIS server. #57 was closed without new code.

| Layer | What it is | Why not (or where tracked) | Checked |
|---|---|---|---|
| `ElectionResults_dashboard_2eceda94387c4bad95bf4ef0294ec490`, `ElectionResults_join_2eceda94387c4bad95bf4ef0294ec490`, `november_2024_precinct_totals_for_reporting`, `detailed_vote_extract_2024_november`, `Nov24_Detailed_Vote_Totals_Test` | Election results and turnout | Results, out of scope. | 2026-10-21 |
| `VoterSatisfactionSurvey_submit_4533ffc5e0c84851a35cc97e64bb160a`, `service_584d4105c2d24336b1674bbc8ad5da0a_form` | The Voter Satisfaction Survey's intake and its form | Survey intake. Never query it. | 2026-10-21 |
| `ElectionGeography_public_4533ffc5e0c84851a35cc97e64bb160a` layer 2 officeholder fields | Representative names, photos, party and contacts | Never shown or requested (#87, #90; Districts, above). | 2026-10-21 |
| `ElectionGeography_public_4533ffc5e0c84851a35cc97e64bb160a` layer 0, `Polling_Centers_WFL1` | Other polling place lists (57 and 152 rows) | Not the Election Day list (Voting locations, above). | 2026-10-22 |
| `BOE/Polling_Place_Precincts`, `BOE/PRECINCTS_2023` | The City Board's own GIS server: 55 polling places, past Polling Centers, and precincts with district fields | Candidates for #87; not the Election Day list, and `PRECINCTS_2023` failed every query (the `maps6` BOE comment on #57). | 2026-10-21 |
| `Live_Election_Wait_Time_View` | A wait time survey view | Not the City wait source (Wait times, City, above). | 2026-10-22 |
| `Census_2020_Citywide`, `Census_2010_Citywide` | Census outlines | Census layers, not the City Board's (City boundary, above). | 2026-10-22 |
| `Machacek_Library`, `Our_Lady_of_Sorrows_Church`, `Wohl_Center` | One building each, item description "Election", last changed 2024-10-24 | Single-site layers from 2024; the sites come from the voting locations layer. | 2026-10-24 |
| `Precincts_2024_Standard`, `Polls_for_Turnout`, `July_1_2025_Ward_8_Aldermanic_Vacancy_Election`, `July_1_2025_Ward_8_Aldermanic_Vacancy_Election_view`, `July_1_2025_Ward_8_Aldermanic_Vacancy_Election_2_view` | Past election precincts, a July 2025 turnout parameter, a 2025 ward vacancy election | Past elections, stale. | 2026-10-24 |
| `registration_chart_fields`, `Registration_Charts_Project_Summary_Table` | Registration chart tables | Registration statistics, not where or how to vote. | 2026-10-24 |
| `Wards` | The City's ward polygons, owned outside the City Board | The districts layer has the wards from the City Board's own org (Districts, above). | 2026-10-24 |

The rest of the City org, listed 2026-10-24:

<details>
<summary>Named in the tables above (24)</summary>

The City services the "Read by the app" and "Reviewed and not used: St. Louis City" tables give a reason for.

```services city
Census_2010_Citywide
Census_2020_Citywide
detailed_vote_extract_2024_november
ElectionGeography_public_4533ffc5e0c84851a35cc97e64bb160a
ElectionResults_dashboard_2eceda94387c4bad95bf4ef0294ec490
ElectionResults_join_2eceda94387c4bad95bf4ef0294ec490
July_1_2025_Ward_8_Aldermanic_Vacancy_Election
July_1_2025_Ward_8_Aldermanic_Vacancy_Election_2_view
July_1_2025_Ward_8_Aldermanic_Vacancy_Election_view
Live_Election_Wait_Time_View
Machacek_Library
Nov24_Detailed_Vote_Totals_Test
november_2024_precinct_totals_for_reporting
Our_Lady_of_Sorrows_Church
Polling_Centers_WFL1
Polls_for_Turnout
Precincts_2024_Standard
registration_chart_fields
Registration_Charts_Project_Summary_Table
service_584d4105c2d24336b1674bbc8ad5da0a_form
VoterSatisfactionSurvey_submit_4533ffc5e0c84851a35cc97e64bb160a
VotingLocations_currentwait_4533ffc5e0c84851a35cc97e64bb160a
Wards
Wohl_Center
```

</details>

<details>
<summary>The City Board's folder on `maps6.stlouis-mo.gov` (2)</summary>

Both are in the "Reviewed and not used: St. Louis City" table.

```services boe
BOE/Polling_Place_Precincts
BOE/PRECINCTS_2023
```

</details>

<details>
<summary>Other City departments' services (135)</summary>

Planning, community development, land reuse, water, fire, forestry, tornado response, census and
neighborhood layers, and those departments' Survey123 forms, by item title and owner. None is
election data.

```services city
2010_Census_in_2011_Wards
2010_Census_Neighborhoods
2020_Census_in_2011_Wards
2020_Census_Neighborhoods
2020_Census_Tracts
2023_CDA_Assisted_Home_Repairs
2023_CDA_NOFA_Award_Amounts_by_Neighborhood
2023_Home_Repair_Project_Sites
2024_Market_Value_Analysis
Active_and_Completed_Housing_Projects
Active_ARPA_Projects
Active_HUD_Housing_Projects
AHC_Recovery_Lookup_v2
Airport_Parcels
Biking_Infrastructure_Map
Biking_Infrastructure_Map_WFL1
Business_License_2024
Capacity_Building_Applications_DRAFT
CDA_Awards_Basemap
CDA_Beautification_Awards
CDA_Capacity_Building_Awards
CDA_NOFA_Awards_by_Neighborhood_Final
CDA_Proactive_Development_Awards
CelebrateSTL_Ops_2026_WFL1
Census_2000_Citywide
Census_2000_Neighborhoods
Census_2010_in_2021_Wards
Census_2020___2021_Wards_v2
Current_Newspaper_Stands_12292025
Current_Planning_Area_Initiatives_
Debris_Clearing
Demolitions
Disaster_Pantry_Program
Economic_Justice_Index_above_average_Composite_EJI_score_or_within_QCT
EJI_Quintile_Map_DRAFT
Employment_Districts
Flood_Controls_WFL1
Greater_Ville
Grocery_Stores
HealthZip
HOME_ARP_Applications_DRAFT
Housing_NOFA_Applications_DRAFT
Hub Events (public)
HUD_Tour_2023_Reference_Map
Kingsway_East
LIHTC_QCTs_2021
Lot_Maintenance_DRAFT_2
Majority_LRA_Owned_Blocks_With_Private_Vacancy
Majority_LRA_Owned_Blocks_Without_Private_Vacancy_1
Map_NS_SS_Corridor_Investments_DRAFT
Metrolink_Proposed_Northside_Southside_Alignment
MOSAFE_Inspection_Heat_Map
Neighborhood_Areas_Map
Neighborhood_Beautification_Applications_DRAFT
Neighborhood_Organizations
Neighborhood_Plan_Areas_Up_and_Coming
Neighborhood_Transformation_Grant_Project_Sites
Neighborhoods
neighborhoods_(1)
NEW_Active_Water_Division_Accounts_May_2025
NOFA Apps Buffer
NS_Tornado_Map_WFL1
Parcels
PCI2025
Plan_Area_7_WFL1
Plan_Areas_Draft_7_1_2024
PlanArea7_StudyArea
PlanSTL_PLANET
Police_Districts
Private_Vacant_Lots
Prop_NS_Private_Building_Stabilization
PublicDemos_2018thru2023_forweb_pts
Quick_path
Round_1_Blocks_10_14_26_Final_view
Round_1_Neighborhoods
Scene2_WFL1
Scene2_WSL1
ServiceLine_viewing_ee81886ebaa34371b0c53ad8e9b852d6
SLDC_DemonstrationAreas
SLDC_SLDC_Tol_Def_Vac_NP
St__Louis_Neighborhoods_WFL1
STL_Parks
STLAirfield
STLFD_PrideFestOps_2026_WFL1
STLWD_LSLI__Read_Only_View
Storm Path Buffer
Strategic_Land_Use_Plan
StudyArea
survey123_00185cceccf34ada8bc1d3d6199dcd63
survey123_00185cceccf34ada8bc1d3d6199dcd63_fieldworker
survey123_00185cceccf34ada8bc1d3d6199dcd63_stakeholder
survey123_0e580d218e024579b6914f0d5ea937c9_form
survey123_25198059cd654286b153efff3c5a3c25_form
survey123_2fc3c26f37fe4343b3e31a182e9da431_form
survey123_307835287de84152be83a9e6d33ff365_form
survey123_3b9d6c8f19184a99863c7eb649fafcf0
survey123_3b9d6c8f19184a99863c7eb649fafcf0_form
survey123_3b9d6c8f19184a99863c7eb649fafcf0_results
survey123_446d08e3c7e544e1b355ab82299337fe_form
survey123_714b10196d1945f8b5bd1566eb1ca2b4_form
survey123_7278846bc6da4402997a3b3fb5e5e22e
survey123_7278846bc6da4402997a3b3fb5e5e22e_form
survey123_7278846bc6da4402997a3b3fb5e5e22e_results
survey123_776899614dab4973a81f1250b1a7a4af_form
survey123_7b50300d636d4d528d29f2fc378b9bcd
survey123_8030532babd74068a55eacfea249d5aa_form
survey123_8030532babd74068a55eacfea249d5aa_results
survey123_8ba395d1c8a248778cd812816a61da59_form
survey123_956469812b5140b78feaf12a50a6417f_form
survey123_9e92800a71ec413fba8eef5d9beee874_form
survey123_a389e9773af5440ead4df972e26076cb
survey123_a389e9773af5440ead4df972e26076cb_form
survey123_a389e9773af5440ead4df972e26076cb_results
survey123_b47d43dc3b0a466aa55f2432b8a64ff9_form
survey123_c192ee4698474f72906c0d5d6fb27065_form
survey123_c818ba1c4f804ad39174470addc4930e_form
survey123_c818ba1c4f804ad39174470addc4930e_results
survey123_c90dcf21f48f4bea88e8baee443f27cd_form
survey123_caee8e866ffa41038b005e091b1b6042_form
survey123_d5dbbd46b2294a7e9a1092a7c000e1b8_form
survey123_d99eb955be334bea81c10d89ae117e61_form
survey123_dff4bedd420c4da790a8ab8ba30d0106_form
survey123_e43ecaf58a2547ed8eee6bde4ffa068c
survey123_e43ecaf58a2547ed8eee6bde4ffa068c_form
survey123_e43ecaf58a2547ed8eee6bde4ffa068c_results
survey123_f77d9857cc7b4d109dee7d6f7fc05faf
survey123_f77d9857cc7b4d109dee7d6f7fc05faf_form
survey123_f77d9857cc7b4d109dee7d6f7fc05faf_results
survey123_fc72601c36094a7f9c0b2a811945b968_form
The_Ville_shp
ThreeNeighborhoods_shp
Tornado_Path
Tornado_Response_Zones
Tornado_Zone_Street_Tree_Replanting__Round_1___DRAFT_2_WFL1
Union_Delmar_NaturalBridge_Van
```

</details>
