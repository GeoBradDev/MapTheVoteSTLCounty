// Minimal wait time fixtures for the client tests (#103): real rows from the
// County and City layers, recorded on 2026-10-22 by #102 and trimmed to the
// fields the client asks for. #102 adds the full recorded responses under
// docs/raw/fixtures/; these may be replaced by them.
import election from '../config/election.js';

/** The County layer at 9:00 a.m. Central, 2026-10-22, newest first. */
export const countyFresh = [
  { Creator: 'abs602boec', CreationDate: 1792677610370, linecount: 0 },
  { Creator: 'abs604boec', CreationDate: 1792677595176, linecount: 2 },
  { Creator: 'abs616boec', CreationDate: 1792677511456, linecount: 0 },
  { Creator: 'abs614boec', CreationDate: 1792677496619, linecount: 0 },
  { Creator: 'abs608boec', CreationDate: 1792677022692, linecount: 0 },
  { Creator: 'abs601boec', CreationDate: 1792676889402, linecount: 0 },
  { Creator: 'abs604boec', CreationDate: 1792676384976, linecount: 2 },
  { Creator: 'abs619boec', CreationDate: 1792676302676, linecount: 0 },
  { Creator: 'abs613boec', CreationDate: 1792676153809, linecount: 1 },
  { Creator: 'abs621boec', CreationDate: 1792675961620, linecount: 8 },
  { Creator: 'abs612boec', CreationDate: 1792675926565, linecount: 2 },
  { Creator: 'abs609boec', CreationDate: 1792675903260, linecount: 0 },
  { Creator: 'abs616boec', CreationDate: 1792675895525, linecount: 0 },
  { Creator: 'abs603boec', CreationDate: 1792675868876, linecount: 1 },
  { Creator: 'abs602boec', CreationDate: 1792675858028, linecount: 0 },
  { Creator: 'abs601boec', CreationDate: 1792675855292, linecount: 2 },
  { Creator: 'abs608boec', CreationDate: 1792675841609, linecount: 0 },
  { Creator: 'abs620boec', CreationDate: 1792675820678, linecount: 0 },
  { Creator: 'abs607boec', CreationDate: 1792675819962, linecount: 0 },
  { Creator: 'abs606boec', CreationDate: 1792675819104, linecount: 0 },
  { Creator: 'abs601boec', CreationDate: 1792675800826, linecount: 1 },
  { Creator: 'abs601boec', CreationDate: 1792675778060, linecount: 2 },
  { Creator: 'abs601boec', CreationDate: 1792675746570, linecount: 2 },
  { Creator: 'abs601boec', CreationDate: 1792675746177, linecount: 4 },
  { Creator: 'abs601boec', CreationDate: 1792675745694, linecount: 3 },
  { Creator: 'abs614boec', CreationDate: 1792675698639, linecount: 0 },
  { Creator: 'abs615boec', CreationDate: 1792675557528, linecount: 3 },
  { Creator: 'abs607boec', CreationDate: 1792675078472, linecount: 0 },
  { Creator: 'abs615boec', CreationDate: 1792674938064, linecount: 0 },
  { Creator: 'abs611boec', CreationDate: 1792674727499, linecount: 2 },
  { Creator: 'abs612boec', CreationDate: 1792674723991, linecount: 0 },
  { Creator: 'abs605boec', CreationDate: 1792674596933, linecount: 3 },
  { Creator: 'abs616boec', CreationDate: 1792674578426, linecount: 0 },
  { Creator: 'abs605boec', CreationDate: 1792674260512, linecount: 18 },
  { Creator: 'abs619boec', CreationDate: 1792674183716, linecount: 7 },
  { Creator: 'abs609boec', CreationDate: 1792674173297, linecount: 29 },
  { Creator: 'abs604boec', CreationDate: 1792674148952, linecount: 16 },
  { Creator: 'abs602boec', CreationDate: 1792674086476, linecount: 2 },
  { Creator: 'abs617boec', CreationDate: 1792674064717, linecount: 1 },
  { Creator: 'abs621boec', CreationDate: 1792674045128, linecount: 6 },
  { Creator: 'abs614boec', CreationDate: 1792674035887, linecount: 1 },
  { Creator: 'abs620boec', CreationDate: 1792674030215, linecount: 0 },
  { Creator: 'abs608boec', CreationDate: 1792673954824, linecount: 6 },
];

/** The City layer at 9:00 a.m. Central, 2026-10-22: the Board office reported at 8:10 a.m. */
export const cityFresh = [
  {
    name: 'Buder Library',
    earlyvotingoperhours:
      'Mo (13:00-16:00); Tu (11:00-17:00); W-Th (11:00-19:00); Fr-Sa (11:00-16:30); Su (Closed))',
    comments: null,
    waittime: 0,
    created_date_1740505041182: 1792625575903,
  },
  {
    name: 'Carpenter Branch Library',
    earlyvotingoperhours: 'Mo (13:00-16:00); Tu-Th (11:00-17:00); Fr-Sa (11:00-16:30);Su (Closed))',
    comments: null,
    waittime: 4,
    created_date_1740505041182: 1792618241585,
  },
  {
    name: 'Kingshighway Branch Library',
    earlyvotingoperhours: 'Mo (13:00-16:00); Tu-Th (11:00-17:00); Fr-Sa (11:00-16:30);Su (Closed))',
    comments: null,
    waittime: 0,
    created_date_1740505041182: 1792618194291,
  },
  {
    name: 'Schlafly Library',
    earlyvotingoperhours:
      'Mo (13:00-16:00); Tu (11:00-17:00); W-Th (11:00-19:00); Fr-Sa (11:00-16:30); Su (Closed))',
    comments: null,
    waittime: 3,
    created_date_1740505041182: 1792625457624,
  },
  {
    name: 'Walnut Park Library',
    earlyvotingoperhours: 'Mo (13:00-16:00); Tu-Th (11:00-17:00); Fr-Sa (11:00-16:30);Su (Closed))',
    comments: null,
    waittime: 0,
    created_date_1740505041182: 1792620013031,
  },
  {
    name: 'St. Louis City Board of Elections',
    earlyvotingoperhours: 'Mo-Fr (08:00-17:00)',
    comments: null,
    waittime: 0,
    created_date_1740505041182: 1792674645407,
  },
  {
    name: 'Julia Davis Library',
    earlyvotingoperhours:
      'Mo (13:00-16:00); Tu (11:00-17:00); W-Th (11:00-19:00); Fr-Sa (11:00-16:30); Su (Closed))',
    comments: null,
    waittime: 0,
    created_date_1740505041182: 1792625322039,
  },
  {
    name: 'St. Joan of Arc',
    earlyvotingoperhours:
      'Mo (13:00-16:00); Tu (11:00-17:00); W-Th (11:00-19:00); Fr-Sa (11:00-16:30); Su (Closed))',
    comments: 'New early voting site! Opens Tuesday, October 27!',
    waittime: null,
    created_date_1740505041182: null,
  },
];

/** The City layer at 7:44 a.m. Central, 2026-10-22: every report is from 2026-10-21. */
export const cityStale = [
  {
    name: 'Buder Library',
    earlyvotingoperhours:
      'Mo (13:00-16:00); Tu (11:00-17:00); W-Th (11:00-19:00); Fr-Sa (11:00-16:30); Su (Closed))',
    comments: null,
    waittime: 0,
    created_date_1740505041182: 1792625575903,
  },
  {
    name: 'Carpenter Branch Library',
    earlyvotingoperhours: 'Mo (13:00-16:00); Tu-Th (11:00-17:00); Fr-Sa (11:00-16:30);Su (Closed))',
    comments: null,
    waittime: 4,
    created_date_1740505041182: 1792618241585,
  },
  {
    name: 'Kingshighway Branch Library',
    earlyvotingoperhours: 'Mo (13:00-16:00); Tu-Th (11:00-17:00); Fr-Sa (11:00-16:30);Su (Closed))',
    comments: null,
    waittime: 0,
    created_date_1740505041182: 1792618194291,
  },
  {
    name: 'Schlafly Library',
    earlyvotingoperhours:
      'Mo (13:00-16:00); Tu (11:00-17:00); W-Th (11:00-19:00); Fr-Sa (11:00-16:30); Su (Closed))',
    comments: null,
    waittime: 3,
    created_date_1740505041182: 1792625457624,
  },
  {
    name: 'Walnut Park Library',
    earlyvotingoperhours: 'Mo (13:00-16:00); Tu-Th (11:00-17:00); Fr-Sa (11:00-16:30);Su (Closed))',
    comments: null,
    waittime: 0,
    created_date_1740505041182: 1792620013031,
  },
  {
    name: 'St. Louis City Board of Elections',
    earlyvotingoperhours: 'Mo-Fr (08:00-17:00)',
    comments: null,
    waittime: 0,
    created_date_1740505041182: 1792617567063,
  },
  {
    name: 'Julia Davis Library',
    earlyvotingoperhours:
      'Mo (13:00-16:00); Tu (11:00-17:00); W-Th (11:00-19:00); Fr-Sa (11:00-16:30); Su (Closed))',
    comments: null,
    waittime: 0,
    created_date_1740505041182: 1792625322039,
  },
  {
    name: 'St. Joan of Arc',
    earlyvotingoperhours:
      'Mo (13:00-16:00); Tu (11:00-17:00); W-Th (11:00-19:00); Fr-Sa (11:00-16:30); Su (Closed))',
    comments: 'New early voting site! Opens Tuesday, October 27!',
    waittime: null,
    created_date_1740505041182: null,
  },
];

/**
 * How far the Election Day fixtures move the recorded reports: from 9:00 a.m.
 * Central on 2026-10-22 to 9:00 a.m. Central on Election Day, November 3, 2026.
 */
export const ELECTION_DAY_SHIFT_MS = Date.UTC(2026, 10, 3, 15) - Date.UTC(2026, 9, 22, 14);

/**
 * No Election Day report has been published yet (#107), so the Election Day
 * fixtures are derived from the recorded early voting rows: each County report
 * moved to Election Day and renamed from its site's absentee username to the
 * same site's Election Day username (`absentee` to `username` on the polls
 * layer), as the County's Polling Place Lookup app joins them; each City
 * report moved to Election Day. A report whose site the polls rows do not know
 * keeps its name, so it still matches nothing.
 * @param {object[]} rows Report rows (attributes).
 * @param {'county' | 'city'} jurisdiction
 * @param {object[]} [sites] For the County: polls features with `absentee`
 *   and `username` in `properties`.
 * @returns {object[]}
 */
export function asElectionDay(rows, jurisdiction, sites = []) {
  const source = election.waitTimes[jurisdiction];
  const rename = new Map(
    sites.map(({ properties: p }) => [p[source.pollsField], p[source.electionDay?.pollsField]]),
  );
  return rows.map((row) => {
    const moved = { ...row };
    if (typeof moved[source.timeField] === 'number')
      moved[source.timeField] += ELECTION_DAY_SHIFT_MS;
    if (jurisdiction === 'county' && rename.get(row[source.siteField])) {
      moved[source.siteField] = rename.get(row[source.siteField]);
    }
    return moved;
  });
}
