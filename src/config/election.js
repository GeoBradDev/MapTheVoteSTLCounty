// Everything that changes between elections. The next election should be an
// edit to this file, not to the code that reads it. Values come from
// docs/data.md; re-run scripts/inspect-data.mjs before each election.

/**
 * Hours on a date or run of dates. Times are HH:MM, 24-hour, in `timeZone`.
 * A single day has `from === to`.
 * @typedef {object} ScheduleEntry
 * @property {string} from First date, YYYY-MM-DD.
 * @property {string} to Last date, YYYY-MM-DD, inclusive.
 * @property {'weekdays' | 'daily'} days Whether the range skips weekends.
 * @property {string} open Opening time, HH:MM.
 * @property {string} close Closing time, HH:MM.
 */

/**
 * @typedef {object} ElectionConfig
 * @property {string} electionDate Election Day, YYYY-MM-DD.
 * @property {string} electionName Name of the election, for the health check's
 *   log (the home page shows only the date, #80).
 * @property {string} timeZone IANA zone for every time in this file.
 * @property {string} serviceRoot ArcGIS REST services root, no trailing slash.
 * @property {{ precincts: string, polls: string, countyBoundary: string,
 *   pollRooms: string }} layers
 *   Layer paths relative to `serviceRoot`.
 * @property {string} absenteeWhere Where clause on the polls layer for in-person
 *   absentee sites.
 * @property {{ where: string, fields: { id: string, kind: string, room: string },
 *   electionDay: string, absentee: string }} pollRooms The polling place room
 *   layer's filter, the fields the app reads, and the `kind` values of
 *   Election Day and early voting rows (#100).
 * @property {RegExp} sampleBallotUrlPattern A sample ballot link from the
 *   precinct `html` field must match this before it is shown.
 * @property {string} congressionalField Precinct field with the congressional
 *   district in effect for this election.
 * @property {{ key: string, field: string }[]} districtFields The precinct
 *   fields the districts card lists, in order. `key` names the row's label in
 *   the results copy; `field` is the precinct layer field it reads.
 * @property {string} officialLookupUrl The county's own lookup app, the
 *   fallback when ours fails.
 * @property {string} countySiteUrl The county election board's website: the
 *   County block's `boardSiteUrl`, which is here too under that name, as are
 *   its `sources`.
 * @property {number} nearbyPollCount How many nearby polling places to show at
 *   first, and how many more each "Show more" adds.
 * @property {{ sources: string[], lastVerified: string,
 *   schedules: Record<string, ScheduleEntry[]> }} earlyVoting In-person
 *   absentee hours, keyed by the polls layer's `abs_type`.
 * @property {{ open: string, close: string, inLineAtCloseMayVote: boolean,
 *   sources: string[], lastVerified: string }} electionDayHours
 * @property {{ sources: string[], lastVerified: string, phone: string,
 *   phoneSource: string }} electionDayPollingPlace Where the rule that a
 *   registered county voter may vote at any County polling place on Election
 *   Day is stated (#152), and the county board's number for help finding one,
 *   with the page that lists it.
 * @property {{ minutes: number, electionDayMinutes: number }} layerMaxAge How
 *   long a loaded layer, such as the polling places, is reused before the app
 *   fetches it again, and the shorter limit on Election Day (#84).
 * @property {WaitTimesConfig} waitTimes Early voting line counts (#103) and
 *   Election Day line counts (#107).
 * @property {{ county: JurisdictionConfig, city: JurisdictionConfig }}
 *   jurisdictions Each jurisdiction's own block (#86).
 */

/**
 * One jurisdiction's block (#86). The County's also holds the County-only keys
 * above (`absenteeWhere`, `districtFields`, `earlyVoting` and the rest); the
 * City's grows as its features land (#87 to #92).
 * @typedef {object} JurisdictionConfig
 * @property {'county' | 'city'} id
 * @property {string} name Display name, like "St. Louis County".
 * @property {string} board The election board's name.
 * @property {string} serviceRoot ArcGIS REST services root, no trailing slash.
 * @property {Record<string, string>} layers Layer paths relative to `serviceRoot`.
 * @property {string} [officialLookupUrl] The board's own lookup, the fallback
 *   when ours fails, when it is made for this election (the County's). The
 *   City's is in referrals.js.
 * @property {string} [boardSiteUrl] The board's website (the County's; the
 *   City's is in referrals.js).
 * @property {string[]} sources Each named layer's own description.
 * @property {string} [precinctField] The precincts layer's code field (the
 *   City's; the County's is `precinct`, read by src/data/arcgis.js).
 * @property {{ office: string, name: string, id: string }} [districtLayerFields]
 *   The City districts layer's fields the app reads (#87).
 * @property {{ id: string, name: string, address: string, zip: string,
 *   entry: string, accessibleEntry: string }} [siteFields] The City voting
 *   locations layer's fields the app reads (#87, #89).
 * @property {string} [pollsWhere] The City's Election Day voting locations filter.
 * @property {number} [pollsListed] How many Election Day sites the City Board lists.
 * @property {string} [earlyVotingWhere] The City's early voting sites filter.
 * @property {string} [boundaryWhere] The filter on `layers.boundary` for the City outline.
 * @property {string} [lastVerified]
 */

/**
 * One jurisdiction's wait time layer. Field names live here because a
 * republish can rename them (the City's report fields carry a numeric suffix).
 * @typedef {object} WaitTimesSource
 * @property {boolean} enabled Whether the app asks this layer at all.
 * @property {string} serviceRoot ArcGIS REST services root of the layer's org.
 * @property {string} layer Layer path relative to `serviceRoot`.
 * @property {string} where Where clause of the query.
 * @property {string} siteField The report's site key.
 * @property {string} valueField The report's value.
 * @property {string} timeField The report's time, epoch milliseconds.
 * @property {'people' | 'minutes'} unit What `valueField` counts. Never converted.
 * @property {string} source The board that reports it, for the "Reported by" line.
 * @property {string} sourceUrl The board's own public page for these counts,
 *   one of `waitTimes.sources`; the wait times page links it (#104).
 */

/**
 * @typedef {object} WaitTimesConfig
 * @property {boolean} enabled Turns every wait time request off.
 * @property {number} refreshSeconds How often the shared loop asks each layer.
 * @property {number} maxAgeMinutes A report older than this is not shown.
 * @property {number} skewMinutes How far in the future a report time may be.
 * @property {string[]} sources
 * @property {string} lastVerified
 * @property {WaitTimesSource & { pollsField: string, electionDay: {
 *   enabled: boolean, serviceRoot: string, layer: string, where: string,
 *   pollsField: string, sourceUrl: string } }} county `pollsField` is the polls layer field
 *   `siteField` matches. `electionDay` replaces those values on the election
 *   date (#107).
 * @property {WaitTimesSource & { hoursField: string, commentsField: string,
 *   closedText: string, electionDay: { enabled: boolean, where: string } }}
 *   city The site's hours text, its comments field, and the comment text that
 *   marks a site closed. `electionDay.where` replaces `where` on the election
 *   date (#107), when Election Day hours replace the hours field.
 */

// The boards' own public pages for the early voting line counts (#102).
// The county's Absentee Voting Lookup app shows its counts.
const countyWaitSource =
  'https://stlouiscovotes.maps.arcgis.com/apps/instant/nearby/index.html?appid=9301b4594bef4d9c9271778e4648179d';
// The county's November 3, 2026 Polling Place Lookup app (web map
// 5e98818fdb354d719193ec562d359050), where Election Day counts would show
// (#107).
const countyPollingPlaceLookup =
  'https://stlouiscovotes.maps.arcgis.com/apps/instant/nearby/index.html?appid=13fb36e785c84dbdbcc5219f999652ba';
// The City Board's public Election Wait Times Dashboard.
const cityWaitSource = 'https://www.arcgis.com/apps/dashboards/8548fe3a065a455182181399909102ef';

// The 2022 map, which applies on November 3, 2026 (#150). On September 3,
// 2026 the Missouri Supreme Court held the 2025 map (H.B. 1) does not take
// effect unless voters approve it (Glahn v. Hoskins, No. SC101805; the
// Revisor's note on RSMo 128.346): "The congressional districts established by
// the General Assembly in 2022 remain in full force and effect for the November
// 2026 general election." The County's own sample ballots follow the 2022 map.
// Checked 2026-10-23. congressional_district_25 is the 2025 map; do not show it.
const congressionalField = 'congressional_district_20';

/**
 * The map `congressionalField` holds, and the County's districts on it
 * (Districts 1 and 2 on the 2022 map). The data health check fails a precinct
 * whose value is not `US Representative District <district> (<year>)` for one
 * of them (#150). A named export, not part of the default object, so the app's
 * bundle leaves it out: only the health check reads it.
 */
// Marked pure so the bundler can drop the call: deepFreeze is a call it would
// otherwise keep.
export const congressionalMap = /* @__PURE__ */ deepFreeze({ year: '2022', districts: ['1', '2'] });

/** Freezes a config object and everything in it, except a RegExp. */
export function deepFreeze(value) {
  // A frozen RegExp has a read-only lastIndex, which breaks global matching.
  if (value === null || typeof value !== 'object' || value instanceof RegExp) return value;
  Object.values(value).forEach(deepFreeze);
  return Object.freeze(value);
}

// Each layer's own description (its field list), the source a block cites for
// the layers it names, so the daily link check confirms every one answers.
const layerSources = (root, layers) => Object.values(layers).map((l) => `${root}/${l}?f=pjson`);

const countyServiceRoot = 'https://services6.arcgis.com/wkbq75VVf2MvUvs7/ArcGIS/rest/services';
// Not the lookup_view_* services: their names look current, but they point at
// 2024 data.
const countyLayers = {
  precincts: 'precincts_2026_11_view/FeatureServer/1',
  polls: 'polls_2026_11_view/FeatureServer/1',
  countyBoundary: 'St_Louis_County_Boundary/FeatureServer/0',
  // The board's polling place dashboard view: the room each site votes in
  // (#100). Never ask it for `*`: it also holds staffing, photo, turnout and
  // task fields (`pollRooms` below names the only ones the app reads).
  pollRooms: 'November_3_2026_Polling_Places_Dashboard_view/FeatureServer/0',
};

// St. Louis County. Every value is the one the app has always used.
const county = {
  id: 'county',
  name: 'St. Louis County',
  board: 'St. Louis County Board of Elections',
  serviceRoot: countyServiceRoot,
  layers: countyLayers,
  // The layers above; docs/data.md has the inspection.
  sources: layerSources(countyServiceRoot, countyLayers),
  absenteeWhere: "abs_type IN ('abs','boe')",
  // The room inside each polling place (#100; owner decision, 2026-10-23: shown,
  // labeled as St. Louis County Board of Elections data). `id` is the location
  // number: the polls layer's `loc` on Election Day rows (`kind` is
  // `electionDay`), its `loc_abs` on early voting rows (`absentee`). Checked
  // live on 2026-10-23 (docs/data.md).
  pollRooms: {
    where: "ACTIVE IN ('ACTIVE','ABSENTEE')",
    fields: { id: 'LOCATION_ID', kind: 'ACTIVE', room: 'ACTIVE_ROOM' },
    electionDay: 'ACTIVE',
    absentee: 'ABSENTEE',
  },
  sampleBallotUrlPattern:
    /^https:\/\/stlouiscovotes\.maps\.arcgis\.com\/sharing\/rest\/content\/items\/[0-9a-f]{32}\/data$/,
  congressionalField,
  // Never the pre-joined `districts` field: it includes the 2025 congressional
  // map, which is not in effect. docs/data.md describes each field.
  districtFields: [
    { key: 'congressional', field: congressionalField },
    { key: 'stateSenate', field: 'state_senate_20' },
    { key: 'stateHouse', field: 'legislative_district_20' },
    { key: 'countyCouncil', field: 'county_council_20' },
    { key: 'municipality', field: 'municipality' },
    { key: 'ward', field: 'ward' },
    { key: 'township', field: 'township' },
    { key: 'school', field: 'school' },
    { key: 'juniorCollege', field: 'junior_college_district' },
    { key: 'fire', field: 'fire' },
    { key: 'ambulance', field: 'ambulance' },
    { key: 'ambulanceSubdistrict', field: 'ambulance_subdistrict' },
    { key: 'library', field: 'library_district' },
    { key: 'sewer', field: 'sewer' },
    // Special districts, usually empty.
    { key: 'light', field: 'light_district' },
    { key: 'road', field: 'road' },
    { key: 'communityImprovement', field: 'community_improvement' },
    { key: 'business', field: 'business_district' },
    { key: 'transportation', field: 'transportation' },
    { key: 'neighborhoodImprovement', field: 'neighborhood_improvement_dist' },
    { key: 'annexation', field: 'annexation' },
  ],
  officialLookupUrl:
    'https://stlouiscovotes.maps.arcgis.com/apps/instant/lookup/index.html?appid=4c3116b104af40bea77ebea20aaae275',
  // Issue #1 chose the county board's own site. Since 2026-10-21 every page of
  // that site, stlouiscovotes.info, sends visitors here, so link this page
  // directly (#73). stlouiscountymovotes.gov reaches it only after two hops.
  boardSiteUrl: 'https://stlouiscountymo.gov/st-louis-county-government/board-of-elections/',

  // From the county's Absentee Voting Lookup app introduction, re-read from the
  // app's live config on 2026-10-21 (issue #16). The board's old website showed
  // 2020 hours on its absentee page, so it was never a source; that site was
  // retired on 2026-10-21 (#73). Re-check before launch.
  earlyVoting: {
    sources: [
      'https://stlouiscovotes.maps.arcgis.com/apps/instant/nearby/index.html?appid=9301b4594bef4d9c9271778e4648179d',
    ],
    lastVerified: '2026-10-21',
    schedules: {
      boe: [
        { from: '2026-09-22', to: '2026-10-30', days: 'weekdays', open: '08:00', close: '16:30' },
        { from: '2026-10-24', to: '2026-10-24', days: 'daily', open: '09:00', close: '13:00' },
        { from: '2026-10-31', to: '2026-10-31', days: 'daily', open: '09:00', close: '13:00' },
        { from: '2026-11-02', to: '2026-11-02', days: 'daily', open: '08:00', close: '17:00' },
      ],
      abs: [
        { from: '2026-10-20', to: '2026-10-30', days: 'weekdays', open: '08:00', close: '16:30' },
        { from: '2026-10-24', to: '2026-10-24', days: 'daily', open: '09:00', close: '13:00' },
        { from: '2026-10-31', to: '2026-10-31', days: 'daily', open: '09:00', close: '13:00' },
        { from: '2026-11-02', to: '2026-11-02', days: 'daily', open: '08:00', close: '17:00' },
      ],
    },
  },

  // Owner decision on issue #152 (2026-10-22), reversing #72: a registered
  // County voter may vote at any polling place in St. Louis County on Election
  // Day. This does not apply in the City of St. Louis, which has its own rule
  // (cityResults.js). The County Board's Polling Places page says so: "Voters
  // in Saint Louis County may vote at any polling place in the County on
  // Election Day." It answers 403 to scripts, so it was read in a browser on
  // 2026-10-22 (docs/data.md). County data assigns no polling place to a
  // precinct, so the app lists the nearest; the phone number is in the
  // county's November 3, 2026 Polling Place Lookup app, re-read on 2026-10-21
  // (its old Contact Us page now redirects, #73).
  electionDayPollingPlace: {
    sources: [
      'https://stlouiscountymo.gov/st-louis-county-government/board-of-elections/elections/polling-places/',
    ],
    lastVerified: '2026-10-22',
    phone: '314-615-1800',
    phoneSource: countyPollingPlaceLookup,
  },
};

// St. Louis City (#85). The City Board's layers, checked live on 2026-10-22
// (docs/data.md, "St. Louis City"). The precincts layer's `precinctid` reads
// `W <ward> P <precinct>`, like `W 1 P 12`: 207 precincts in wards 1 to 14.
// The values only the City's results cards read (its early voting hours, #91,
// its Election Day rule, #89, and its districts card's rows, #90) are in
// ./cityResults.js, loaded only with the City chunk (#147).
const cityServiceRoot = 'https://services6.arcgis.com/HZXbCkpCSqbGd0vK/ArcGIS/rest/services';
const cityGeography = 'ElectionGeography_public_4533ffc5e0c84851a35cc97e64bb160a/FeatureServer';
const cityLayers = {
  precincts: `${cityGeography}/1`,
  // One polygon per office. Never ask it for `*`: it also holds officeholder
  // names, photos, parties and contact details.
  districts: `${cityGeography}/2`,
  // The voting locations, one row per site (the wait time layer's own rows).
  // Never ask it for `*`: it also holds staff contact fields.
  sites: 'VotingLocations_currentwait_4533ffc5e0c84851a35cc97e64bb160a/FeatureServer/0',
  // The citywide offices' polygons in the districts layer (`boundaryWhere`): the
  // City Board publishes no separate boundary layer.
  boundary: `${cityGeography}/2`,
};
const city = {
  id: 'city',
  name: 'City of St. Louis',
  board: 'St. Louis City Board of Election Commissioners',
  serviceRoot: cityServiceRoot,
  layers: cityLayers,
  precinctField: 'precinctid',
  // The districts layer fields the app reads: names and numbers only (#90).
  districtLayerFields: { office: 'electedoffice', name: 'district', id: 'districtid' },
  // The voting location fields the app reads. 7 of the 56 Election Day sites
  // have no ZIP on 2026-10-22. `entry` and `accessibleEntry` are the City
  // Board's entrance notes, like "off parking lot accessed from Vista Ave.",
  // filled on every public row (#89); `accessible` is empty on every row, so it
  // is not read.
  siteFields: {
    id: 'facilityid',
    name: 'name',
    address: 'fulladdr',
    zip: 'pollingPlaceZipCode',
    entry: 'entrydetails',
    accessibleEntry: 'disabledentry',
  },
  // The Election Day list: the 56 sites of the City Board's polling places page
  // ("Total 56 polling places"), which are the public rows less the Board
  // office, an early voting site that page does not list for Election Day.
  pollsWhere: "publicview = 'Yes' AND facilityid <> 'St._Louis_City_Election_Board'",
  // The count that page gives; the health check warns when the filter finds
  // another number.
  pollsListed: 56,
  // The 8 No Excuse Absentee sites on the same page: the City Board's own
  // dashboard filter (waitTimes.city.where).
  earlyVotingWhere: "publicview = 'Yes' AND earlyvoting = 'Yes'",
  boundaryWhere: "districtid = 'City of St. Louis'",
  // The layers above; docs/data.md has the inspection.
  sources: [...new Set(layerSources(cityServiceRoot, cityLayers))],
  // The City board's site and lookup page do not change between elections, so
  // they are in referrals.js (src/data/jurisdictions.js pairs them with this
  // block). This file holds only what a new election changes.
  lastVerified: '2026-10-22',
};

/**
 * The jurisdictions the app serves (#86), keyed by `id`. Code that serves
 * either one reads its block here; src/data/jurisdictions.js pairs each with its
 * data adapter.
 * @type {{ county: JurisdictionConfig, city: JurisdictionConfig }}
 */
export const jurisdictions = deepFreeze({ county, city });

// Values every jurisdiction shares.
const shared = {
  electionDate: '2026-11-03',
  electionName: 'November 3, 2026 General Election',
  timeZone: 'America/Chicago',

  nearbyPollCount: 3,
  // The county serves the polls layer with max-age=30. Ten minutes keeps a
  // tab left open from showing a moved polling place for long, without asking
  // the county again on every search; two on Election Day, when emergency
  // relocations happen (#84).
  layerMaxAge: { minutes: 10, electionDayMinutes: 2 },

  // Early voting line counts (#103), traced in #102 (docs/data.md, "Wait
  // times"). Both boards report people in line, not minutes (the City by
  // owner decision, 2026-10-22). Both layers send max-age=30, so a 30 second
  // refresh adds no load. 120 minutes matches the County view's own 2 hour
  // window, so the app never shows a count the official app would not.
  waitTimes: {
    enabled: true,
    refreshSeconds: 30,
    maxAgeMinutes: 120,
    skewMinutes: 5,
    sources: [countyWaitSource, cityWaitSource, countyPollingPlaceLookup],
    lastVerified: '2026-10-22',
    county: {
      enabled: true,
      // A different org from serviceRoot. The view keeps only early voting
      // reports from the last 2 hours, so it is empty while sites are closed.
      serviceRoot: 'https://services6.arcgis.com/IeWM0VelvUwce9qE/ArcGIS/rest/services',
      layer: 'Voters_in_Line_View/FeatureServer/0',
      where: '1=1',
      siteField: 'Creator',
      valueField: 'linecount',
      timeField: 'CreationDate',
      // Early voting reports come from the site's absentee username.
      pollsField: 'absentee',
      unit: 'people',
      source: 'St. Louis County Board of Elections',
      sourceUrl: countyWaitSource,
      // Election Day counts (#107), read instead of the values above on the
      // election date; every other field is the block's own. The County's
      // Polling Place Lookup app joins Election Day reports on the polls
      // layer's `username` (like `loc019boec`), but on 2026-10-22 this view
      // kept only `username LIKE 'abs%'` reports, so no Election Day report
      // reaches it and every polling place shows no count. When the County
      // widens the view or publishes another, point `layer` (and `where`) at
      // it: a config change, nothing else.
      electionDay: {
        enabled: true,
        serviceRoot: 'https://services6.arcgis.com/IeWM0VelvUwce9qE/ArcGIS/rest/services',
        layer: 'Voters_in_Line_View/FeatureServer/0',
        where: '1=1',
        pollsField: 'username',
        sourceUrl: countyPollingPlaceLookup,
      },
    },
    city: {
      enabled: true,
      serviceRoot: 'https://services6.arcgis.com/HZXbCkpCSqbGd0vK/ArcGIS/rest/services',
      layer: 'VotingLocations_currentwait_4533ffc5e0c84851a35cc97e64bb160a/FeatureServer/0',
      // The dashboard's own filter: the City's early voting sites.
      where: city.earlyVotingWhere,
      // The site key in the owner's City query (#103 comment, 2026-10-22).
      siteField: 'name',
      // People in line, not minutes (owner decision, 2026-10-22): the City
      // Board's dashboard shows it as "Estimated People in Line", although the
      // field alias says minutes.
      valueField: 'waittime',
      // The joined report's time. Never last_edited_date, the site row's own
      // edit time, which does not move with reports.
      timeField: 'created_date_1740505041182',
      hoursField: 'earlyvotingoperhours',
      commentsField: 'comments',
      closedText: 'poll closed',
      unit: 'people',
      source: 'St. Louis City Board of Election Commissioners',
      sourceUrl: cityWaitSource,
      // Election Day counts (#107): the same layer, filtered to the City's
      // Election Day polling places, open by `electionDayHours` rather than
      // the early voting hours field.
      electionDay: {
        enabled: true,
        where: city.pollsWhere,
      },
    },
  },

  // Decided in issue #1.
  electionDayHours: {
    open: '06:00',
    close: '19:00',
    inLineAtCloseMayVote: true,
    // The county FAQ that also said so now redirects (#73).
    sources: ['https://revisor.mo.gov/main/OneSection.aspx?section=115.407'],
    lastVerified: '2026-10-21',
  },
};

// The County block's values without its identity, for the default export.
const countyValues = Object.fromEntries(
  Object.entries(county).filter(([key]) => !['id', 'name', 'board'].includes(key)),
);

/**
 * The shared values plus the County block's, as one object: what the code that
 * serves only County voters today reads (`election.serviceRoot` and so on).
 * `countySiteUrl` is the County block's `boardSiteUrl`. Jurisdiction-aware code
 * reads `jurisdictions` instead.
 * @type {ElectionConfig}
 */
const election = deepFreeze({
  ...shared,
  ...countyValues,
  countySiteUrl: county.boardSiteUrl,
  jurisdictions,
});

export default election;
