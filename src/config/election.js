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
 * @property {{ minutes: number, electionDayMinutes: number }} layerMaxAge How
 *   long a loaded layer, such as the polling places, is reused before the app
 *   fetches it again, and the shorter limit on Election Day (#84).
 * @property {WaitTimesConfig} waitTimes Early voting line counts (#103).
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
 */

/**
 * @typedef {object} WaitTimesConfig
 * @property {boolean} enabled Turns every wait time request off.
 * @property {number} refreshSeconds How often the shared loop asks each layer.
 * @property {number} maxAgeMinutes A report older than this is not shown.
 * @property {number} skewMinutes How far in the future a report time may be.
 * @property {string[]} sources
 * @property {string} lastVerified
 * @property {WaitTimesSource & { pollsField: string }} county `pollsField` is
 *   the polls layer field `siteField` matches.
 * @property {WaitTimesSource & { hoursField: string, commentsField: string,
 *   closedText: string }} city The site's hours text, its comments field, and
 *   the comment text that marks a site closed.
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
  // The county serves the polls layer with max-age=30. Ten minutes keeps a
  // tab left open from showing a moved polling place for long, without asking
  // the county again on every search; two on Election Day, when emergency
  // relocations happen (#84).
  layerMaxAge: { minutes: 10, electionDayMinutes: 2 },

  // Early voting line counts (#103), traced in #102 (docs/data.md, "Wait
  // times"). The County reports people in line; the City unit is an open
  // owner question (see `city.valueField`). Both layers send max-age=30, so a 30 second refresh adds no load. 120 minutes matches the
  // County view's own 2 hour window, so the app never shows a count the
  // official app would not.
  waitTimes: {
    enabled: true,
    refreshSeconds: 30,
    maxAgeMinutes: 120,
    skewMinutes: 5,
    sources: [
      // The county's Absentee Voting Lookup app shows these counts.
      'https://stlouiscovotes.maps.arcgis.com/apps/instant/nearby/index.html?appid=9301b4594bef4d9c9271778e4648179d',
      // The City Board's public Election Wait Times Dashboard.
      'https://www.arcgis.com/apps/dashboards/8548fe3a065a455182181399909102ef',
    ],
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
      // Early voting reports come from the site's absentee username; Election
      // Day reports would join on `username` (#107).
      pollsField: 'absentee',
      unit: 'people',
      source: 'St. Louis County Board of Elections',
    },
    city: {
      enabled: true,
      serviceRoot: 'https://services6.arcgis.com/HZXbCkpCSqbGd0vK/ArcGIS/rest/services',
      layer: 'VotingLocations_currentwait_4533ffc5e0c84851a35cc97e64bb160a/FeatureServer/0',
      // The dashboard's own filter.
      where: "publicview = 'Yes' AND earlyvoting = 'Yes'",
      // The site key in the owner's City query (#103 comment, 2026-10-22).
      siteField: 'name',
      // Not settled (owner question on #102): the field alias says minutes,
      // but the City Board's dashboard shows it as "Estimated People in Line".
      // `unit` below follows the dashboard until the owner answers.
      valueField: 'waittime',
      // The joined report's time. Never last_edited_date, the site row's own
      // edit time, which does not move with reports.
      timeField: 'created_date_1740505041182',
      hoursField: 'earlyvotingoperhours',
      commentsField: 'comments',
      closedText: 'poll closed',
      unit: 'people',
      source: 'St. Louis City Board of Election Commissioners',
    },
  },

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
