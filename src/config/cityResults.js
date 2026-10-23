// St. Louis City's results page values that only its own cards read, an
// election config file like ./election.js: the next election edits it too.
// Only the City chunk reads it (src/cityChunk.js), so it stays out of the
// first load (owner decision on #147, 2026-10-22). The City block in
// ./election.js keeps what the first load needs (its layers, fields and
// filters, read by the address search, the adapter and the wait time loop).
import { deepFreeze } from './election.js';
import referrals from './referrals.js';

/**
 * Hours on the given weekdays (0 is Sunday) from `from` to `to`, inclusive.
 * Times are HH:MM, 24-hour, in the election's time zone. A single date has
 * `from === to`.
 * @typedef {object} CityScheduleEntry
 * @property {string} from YYYY-MM-DD.
 * @property {string} to YYYY-MM-DD.
 * @property {number[]} days
 * @property {string} open HH:MM.
 * @property {string} close HH:MM.
 */

// Early voting (No Excuse Absentee) dates and hours (#91), from the City
// Board's polling places page ("No Excuse Absentee Polling Places", per-site
// hours) and its No Excuse Absentee page ("the two weeks prior to each
// election", October 20 to November 2 for November 3), read on 2026-10-22.
// The voting locations layer's `earlyvotingoperhours` text says the same,
// except that it leaves out the Board office's last Saturday, so the page wins
// (docs/data.md, "St. Louis City"). `sites` gives each site's schedule, by the
// voting locations layer's site id.

// The polling places page (the City's official lookup) has the hours.
const hoursSource = referrals.stlCityLookup.url;
// The No Excuse Absentee page, under the board's site, has the dates and who
// may vote this way; the card links it instead of saying the rules (#91).
const noExcuseUrl = `${referrals.stlCityBoard.url}voter/absentee/no-excuse-absentee.cfm`;
// Its Apply to Vote Absentee page covers both ways to vote absentee, by mail
// too, which the No Excuse page says it does not; the card's mail line links it.
const absenteeUrl = `${referrals.stlCityBoard.url}voter/absentee/vote-by-absentee-ballot.cfm`;

const earlyVoting = {
  // In this order: the card cites the first two and links the third for mail
  // and application-based absentee voting.
  sources: [hoursSource, noExcuseUrl, absenteeUrl],
  lastVerified: '2026-10-22',
  sites: {
    Buder_Library: 'lateWeekdays',
    Schlafly_Library: 'lateWeekdays',
    Julia_Davis: 'lateWeekdays',
    Carpenter_Library: 'library',
    Kingshighway_Branch_Library: 'library',
    Walnut_Park_Library: 'library',
    'St._Joan_of_Arc': 'stJoanOfArc',
    'St._Louis_City_Election_Board': 'board',
  },
  schedules: {
    // "Monday-Friday: 8 AM-5 PM. Last Saturday Before Election Day: 9 AM-1 PM."
    board: [
      {
        from: '2026-10-20',
        to: '2026-11-02',
        days: [1, 2, 3, 4, 5],
        open: '08:00',
        close: '17:00',
      },
      { from: '2026-10-31', to: '2026-10-31', days: [6], open: '09:00', close: '13:00' },
    ],
    // Buder, Schlafly and Julia Davis libraries.
    lateWeekdays: [
      { from: '2026-10-20', to: '2026-11-02', days: [1], open: '13:00', close: '16:00' },
      { from: '2026-10-20', to: '2026-11-02', days: [2], open: '11:00', close: '17:00' },
      { from: '2026-10-20', to: '2026-11-02', days: [3, 4], open: '11:00', close: '19:00' },
      { from: '2026-10-20', to: '2026-11-02', days: [5, 6], open: '11:00', close: '16:30' },
    ],
    // Carpenter, Kingshighway and Walnut Park libraries.
    library: [
      { from: '2026-10-20', to: '2026-11-02', days: [1], open: '13:00', close: '16:00' },
      { from: '2026-10-20', to: '2026-11-02', days: [2, 3, 4], open: '11:00', close: '17:00' },
      { from: '2026-10-20', to: '2026-11-02', days: [5, 6], open: '11:00', close: '16:30' },
    ],
    // "Oct. 27-Nov. 2 ONLY", with Buder's hours.
    stJoanOfArc: [
      { from: '2026-10-27', to: '2026-11-02', days: [1], open: '13:00', close: '16:00' },
      { from: '2026-10-27', to: '2026-11-02', days: [2], open: '11:00', close: '17:00' },
      { from: '2026-10-27', to: '2026-11-02', days: [3, 4], open: '11:00', close: '19:00' },
      { from: '2026-10-27', to: '2026-11-02', days: [5, 6], open: '11:00', close: '16:30' },
    ],
  },
};

export default deepFreeze({
  /**
   * @type {{ sources: string[], lastVerified: string,
   *   sites: Record<string, string>,
   *   schedules: Record<string, CityScheduleEntry[]> }}
   */
  earlyVoting,

  // The districts card's rows (#90), in order. `key` names the row's label in
  // the results copy; `offices` are the districts layer's `electedoffice`
  // values it reads (districtLayerFields.office in ./election.js), and the row
  // shows that row's `district` text, never the office. Offices elected
  // citywide or statewide are the same for every City voter and are left out,
  // except the Board of Education, which the County card lists as its school
  // district. A party committee office is never listed here. The whole City is
  // in congressional District 1 under the 2022 map (RSMo 128.461), which stays
  // in effect for November 3, 2026, and under the 2025 HB 1 text (RSMo
  // 128.471); docs/data.md has the check. Read from the layer on 2026-10-22.
  districts: {
    rows: [
      { key: 'congressional', offices: ['United States House of Representatives'] },
      { key: 'stateSenate', offices: ['State Senate'] },
      { key: 'stateHouse', offices: ['State House Representative'] },
      { key: 'cityWard', offices: ['Alderman', 'Alderwoman'] },
      // The rows say "St. Louis Community College Trustee"; the field's coded
      // values say "Community College Trustee".
      {
        key: 'juniorCollege',
        offices: ['St. Louis Community College Trustee', 'Community College Trustee'],
      },
      { key: 'school', offices: ['Board of Education of the City of St. Louis'] },
    ],
    // The congressional row's check: the 2022 map's first district and the
    // Revisor's note that it stays in effect for November 2026, and H.B. 1's
    // (2025) first district as truly agreed.
    sources: [
      'https://revisor.mo.gov/main/OneSection.aspx?section=128.461',
      'https://revisor.mo.gov/main/OneSection.aspx?section=128.346',
      'https://documents.house.mo.gov/billtracking/bills254/hlrbillspdf/3344H.01T.pdf',
    ],
    lastVerified: '2026-10-22',
  },

  // Where a City voter may vote on Election Day, in the City Board's own words
  // from its polling places page, re-read on 2026-10-22 (#89). Any City voter
  // may vote at any of the listed locations; the County has its own rule
  // (electionDayPollingPlace, #152). Shown as quoted; confirm it with the City
  // Board before each election. `source` names the page in referrals.js it is quoted from.
  electionDayRule: {
    quote:
      'Any voter who is registered to vote at an address within the boundaries of St. Louis City can vote at any of the listed locations on November 3, 2026.',
    source: 'stlCityLookup',
    lastVerified: '2026-10-22',
  },
});
