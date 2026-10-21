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

Parsing: `parseSampleBallot` in `src/data/sampleBallot.js` reads the field with a
small, strict tokenizer. It takes the `href` of the first `<a>` tag that has one,
accepts it only when it matches `sampleBallotUrlPattern` in `src/config/election.js`,
and takes the file name from the link text. A field with no link comes back as plain
text. A rejected link, or markup the parser does not know (it reads only text,
comments, a few formatting tags, and the attributes `href`, `target`, `title` and
`rel`), comes back as nothing. Never render `html` as raw
HTML; a test fails on `dangerouslySetInnerHTML` anywhere under `src/`.
`node scripts/check-sample-ballots.mjs` runs the parser over every precinct on the live
layer and exits 1 unless each `In Election` precinct has its own valid link and every
other precinct a message. Run it before each election.

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
looked-up point (geocoded address or "Use my location"), or from the precinct's center
when the page was opened without a lookup (a reload or a shared link), with a plain note
that any polling place in the county works.
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
date, and the early voting card (#16) shows it. Re-read on 2026-10-21 from the app's
live config (`introductionContent` in
`https://www.arcgis.com/sharing/rest/content/items/9301b4594bef4d9c9271778e4648179d/data?f=json`):
unchanged. The county website's absentee page
(`https://stlouiscovotes.info/voting/absentee-voting/`) still shows 2020 hours and an older
five-site list, so it is not a source for these dates. Re-check the app before launch.

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

Polygon, 1 feature (523.98 sq mi). A precinct point query that returns nothing
is the main sign a point is outside the county; `isInCountyBoundary` in
`src/data/arcgis.js` confirms it with a point query on this layer. Use the
boundary for the map outline too.

Out of county: `locate` in `src/features/lookup/locate.js` takes a place,
`{ lat, lng, state?, county? }`, so it works with any geocoder and with
coordinates alone. Photon returns `state` and `county` (for example `Missouri`,
`Saint Louis County`); see Geocoding for St. Louis City. The Census (`geographies`
endpoint, `Counties` layer `NAME`) and Esri (`Subregion`, `RegionAbbr`) geocoders
return them too, for example `St. Louis city`, `MO`. With no precinct at the point, a
place in St. Louis City is sent to the City's Board of Election Commissioners,
one elsewhere in Missouri to the Secretary of State Voter Outreach Center (the
county apps' own no-results link), and one outside Missouri gets a generic
message. A point inside the boundary with no precinct goes to the county's
official lookup, and a place with no state (coordinates alone) gets a message for
both Missouri and elsewhere. The two referral links are in
`src/config/referrals.js`. The City board's page
is on `stlouis-mo.gov`; `stlelections.com` is a parked domain for sale (checked
2026-10-21), so do not link it.

"Use my location": `getDeviceLocation` in `src/features/lookup/deviceLocation.js`
returns only `{ lat, lng }` from the browser's position, which is the
coordinates-only place `locate` takes. Only those coordinates are sent, as the
`geometry` of the precinct and boundary queries (a GET query string, like every
ArcGIS query here). The app never puts them in the page URL, history state or
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
`county`; the provider fills `county: St. Louis city` for that case so the City
referral (#8) works.

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
- **One address, two houses:** the county has records with the same number, street
  and ZIP that are separate houses: 50 Country Club Ln 63033 is in Black Jack and in
  Florissant, about 470 m apart, in precincts SPL021 and SPL026, and 2100 Walton Rd
  63114 is in Vinita Park and Overland, about 100 m apart, in UNV031 and MID002. Two
  records with no unit count as one house only when they have the same municipality
  (`MUNI`) and lie within about 50 m (a building and a parcel point). Otherwise the
  answer is no match, even with the ZIP, town or a unit typed; the voter is pointed to
  "Use my location" and the county's official lookup.
- **Units:** a typed unit ("Apt 13B", "#2") picks its own record when exactly one record
  has it. Otherwise every record of the address, units included, must be in one
  municipality, since a unit can sit across a town line from its house (1950 Walton Rd
  63114: the house in Overland, MID002; Unit R in Vinita Park, UNV031; about 110 such
  addresses in the county), and then the house's own record (no unit) answers, else a
  unit's point when all units are within about 300 m. Anything else is no match.
  Records for utility poles, cell towers, billboards, ATMs and substations (`UNITDESC`
  `UP`, `CELL TOWER`, `BILLBOARD`, `ATM`, `SUBSTATION`) are not homes and are ignored.
  A unit number with a space ("2 FL") is suggested as its address, without the unit. A complex can have over
  300 units at one number, so a find asks for up to 1000 records; more counts as the
  layer being unavailable.
- **Two addresses fit** (two ZIPs or two streets): no match, with no fallback, since
  the official data says the text is ambiguous. A ZIP picks one.
- **No match in the live layer:** Photon. The hosted copy is not asked, because the
  live layer is its newer superset; the copy could only add a retired address.
- **A layer unavailable** (network error, non-2xx such as a firewall 403, ArcGIS
  error body, malformed body, too many records, or no answer in 2.5 s for the live
  layer, 3 s for the hosted copy): the next source. Every source unavailable is a
  `GeocoderUnavailableError`; a county "no match" with Photon unavailable is no
  match.
- **St. Louis City:** the county layers hold no City addresses, so a City address
  falls through to Photon and keeps the City referral (#8). A county match that
  neither a typed ZIP nor a typed town other than St. Louis confirms is checked
  against Photon (at most 3 s): if Photon finds the same text in St. Louis City, the
  answer is no match (add the ZIP). If Photon is down or slow, the county match
  stands. A typed ZIP is trusted: a City address with the same number, street, type
  and direction in a ZIP that crosses the City line would still resolve to the
  county one, which we judge too rare to slow every lookup for.
- **Suggestions:** `STATUS = 'Current' AND FULL_ADDRESS LIKE '<typed>%'` in county
  spelling (AVENUE as AVE, SAINT as ST, a typed ZIP after a comma as
  `ZIPCODE = '<zip>'`), 25 records ordered by address, units collapsed to their
  address unless a unit is typed, at most 5 shown. A street type in the middle of a
  name stays as typed ("Olive Street Rd"). County suggestions carry no point, since
  one label can be two houses: a pick is found again by its label (which has the ZIP),
  under every rule above. Photon suggests only when the county layers are unavailable
  or have none (a City address, or a spelling the prefix misses); its suggestions
  carry their place as before.

Privacy: the address goes to the county layers only in a POST body, never a URL,
with `cache: no-store`, no cookies (`credentials: 'omit'`; the live server sets an
`AGS_ROLES` cookie, which is never stored) and no referrer. Photon gets the address
only when the county has no match or no county layer answers, or for the City check
of a county match typed with no ZIP or town; it gets it in a GET query string, as
before (#38). Nothing is stored. The Content-Security-Policy
allows `https://maps.stlouisco.com` and `https://services2.arcgis.com` in
`connect-src`.

`node scripts/check-geocoder.mjs`, 2026-10-21: the 10 polling place addresses
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
that City Hall (1200 Market St, 63103) still gets the City referral: it does.
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
in issue #1 (Election Day hours and their sources, the 3 to 5 range for
nearby polling places, the county site URL, and the source for the home page's
line that county voters may vote at any polling place).
When the next election's inspection changes them, edit that file; this doc
records what the inspection found and why.
