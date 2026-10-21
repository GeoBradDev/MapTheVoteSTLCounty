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
 * @property {string} officialLookupUrl The county's own lookup app, the
 *   fallback when ours fails.
 * @property {number} nearbyPollCount How many nearby polling places to show.
 * @property {{ sources: string[], lastVerified: string,
 *   schedules: Record<string, ScheduleEntry[]> }} earlyVoting In-person
 *   absentee hours, keyed by the polls layer's `abs_type`.
 * @property {{ open: string, close: string, inLineAtCloseMayVote: boolean,
 *   sources: string[], lastVerified: string }} electionDayHours
 */

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
  // The 2025 map. congressional_district_20 is the old map; do not show it.
  congressionalField: 'congressional_district_25',
  officialLookupUrl:
    'https://stlouiscovotes.maps.arcgis.com/apps/instant/lookup/index.html?appid=4c3116b104af40bea77ebea20aaae275',
  nearbyPollCount: 3,

  // From the county's Absentee Voting Lookup app introduction. Re-check it
  // against the county website before launch.
  earlyVoting: {
    sources: [
      'https://stlouiscovotes.maps.arcgis.com/apps/instant/nearby/index.html?appid=9301b4594bef4d9c9271778e4648179d',
    ],
    lastVerified: '2026-10-20',
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
    sources: [
      'https://revisor.mo.gov/main/OneSection.aspx?section=115.407',
      'https://stlouiscovotes.info/faq/',
    ],
    lastVerified: '2026-10-20',
  },
});

export default election;
