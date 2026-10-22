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
 * @property {string} electionName Display name of the election.
 * @property {string} timeZone IANA zone for every time in this file.
 * @property {string} serviceRoot ArcGIS REST services root, no trailing slash.
 * @property {{ precincts: string, polls: string, countyBoundary: string }} layers
 *   Layer paths relative to `serviceRoot`.
 * @property {string} absenteeWhere Where clause on the polls layer for in-person
 *   absentee sites.
 * @property {RegExp} sampleBallotUrlPattern A sample ballot link from the
 *   precinct `html` field must match this before it is shown.
 * @property {string} congressionalField Precinct field with the current
 *   congressional district.
 * @property {{ key: string, field: string }[]} districtFields The precinct
 *   fields the districts card lists, in order. `key` names the row's label in
 *   the results copy; `field` is the precinct layer field it reads.
 * @property {string} officialLookupUrl The county's own lookup app, the
 *   fallback when ours fails.
 * @property {string} countySiteUrl The county election board's website.
 * @property {number} nearbyPollCount How many nearby polling places to show at
 *   first, and how many more each "Show more" adds.
 * @property {{ sources: string[], lastVerified: string,
 *   schedules: Record<string, ScheduleEntry[]> }} earlyVoting In-person
 *   absentee hours, keyed by the polls layer's `abs_type`.
 * @property {{ open: string, close: string, inLineAtCloseMayVote: boolean,
 *   sources: string[], lastVerified: string }} electionDayHours
 * @property {{ sources: string[], lastVerified: string, phone: string,
 *   phoneSource: string }} electionDayPollingPlace Where the rule that a county
 *   voter must vote at their assigned polling place on Election Day is stated,
 *   and the county board's number for confirming that polling place, with the
 *   page that lists it.
 */

// The 2025 map. congressional_district_20 is the old map; do not show it.
const congressionalField = 'congressional_district_25';

function deepFreeze(value) {
  // A frozen RegExp has a read-only lastIndex, which breaks global matching.
  if (value === null || typeof value !== 'object' || value instanceof RegExp) return value;
  Object.values(value).forEach(deepFreeze);
  return Object.freeze(value);
}

/** @type {ElectionConfig} */
const election = deepFreeze({
  electionDate: '2026-11-03',
  electionName: 'November 3, 2026 General Election',
  timeZone: 'America/Chicago',

  serviceRoot: 'https://services6.arcgis.com/wkbq75VVf2MvUvs7/ArcGIS/rest/services',
  // Not the lookup_view_* services: their names look current, but they point
  // at 2024 data.
  layers: {
    precincts: 'precincts_2026_11_view/FeatureServer/1',
    polls: 'polls_2026_11_view/FeatureServer/1',
    countyBoundary: 'St_Louis_County_Boundary/FeatureServer/0',
  },
  absenteeWhere: "abs_type IN ('abs','boe')",
  sampleBallotUrlPattern:
    /^https:\/\/stlouiscovotes\.maps\.arcgis\.com\/sharing\/rest\/content\/items\/[0-9a-f]{32}\/data$/,
  congressionalField,
  // Never the pre-joined `districts` field: it includes the old congressional
  // map. docs/data.md describes each field.
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
  countySiteUrl: 'https://stlouiscountymo.gov/st-louis-county-government/board-of-elections/',
  nearbyPollCount: 3,

  // From the county's Absentee Voting Lookup app introduction, re-read from the
  // app's live config on 2026-10-21 (issue #16). The county website's absentee
  // page still shows 2020 hours, so it is not a source. Re-check before launch.
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

  // Decided in issue #1.
  electionDayHours: {
    open: '06:00',
    close: '19:00',
    inLineAtCloseMayVote: true,
    // The county FAQ that also said so now redirects (#73).
    sources: ['https://revisor.mo.gov/main/OneSection.aspx?section=115.407'],
    lastVerified: '2026-10-21',
  },

  // Owner decision on issue #72 (2026-10-21), replacing the issue #1 line that
  // county voters may vote at any polling place: follow RSMo 115.430. A voter
  // must vote at their assigned polling place on Election Day, and a
  // provisional ballot cast at the wrong one is not counted. The Secretary of
  // State says the same. County data assigns no polling place to a precinct
  // (docs/data.md), so the app says how to confirm it: the phone number is in
  // the county's November 3, 2026 Polling Place Lookup app, re-read on
  // 2026-10-21 (its old Contact Us page now redirects, #73).
  electionDayPollingPlace: {
    sources: [
      'https://revisor.mo.gov/main/OneSection.aspx?section=115.430',
      'https://www.sos.mo.gov/elections/goVoteMissouri/electionday',
    ],
    lastVerified: '2026-10-21',
    phone: '314-615-1800',
    phoneSource:
      'https://stlouiscovotes.maps.arcgis.com/apps/instant/nearby/index.html?appid=13fb36e785c84dbdbcc5219f999652ba',
  },
});

export default election;
