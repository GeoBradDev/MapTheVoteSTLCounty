// Official offices a voter outside St. Louis County is sent to (a City voter
// when the City precinct cannot be found, #88), and the City
// board's lookup a City precinct page links (#86). The City board's site and
// lookup also sit beside the County's wherever no jurisdiction is known yet:
// the home and learn pages, lookup errors and the error screen (#93). These do not change
// between elections, so they are not in election.js. Check each link
// still answers before every election.

/** @typedef {{ url: string, source: string, lastVerified: string }} Referral */

export default Object.freeze({
  /**
   * The St. Louis City Board of Election Commissioners, on the City's own site.
   * Not stlelections.com, which is a parked domain for sale as of 2026-10-21.
   * @type {Referral}
   */
  stlCityBoard: Object.freeze({
    url: 'https://www.stlouis-mo.gov/government/departments/board-election-commissioners/',
    source: 'https://www.stlouis-mo.gov/',
    lastVerified: '2026-10-21',
  }),

  /**
   * The City board's polling places page, with its Assigned Polling Place
   * Lookup: the City's official lookup, the fallback when ours fails (#86).
   * @type {Referral}
   */
  stlCityLookup: Object.freeze({
    url: 'https://www.stlouis-mo.gov/government/departments/board-election-commissioners/voter/polling-places/index.cfm',
    source: 'https://www.stlouis-mo.gov/government/departments/board-election-commissioners/',
    lastVerified: '2026-10-22',
  }),

  /**
   * The Missouri Secretary of State Voter Outreach Center, which looks up any
   * Missouri voter. The county's own lookup apps use it as their no-results link.
   * @type {Referral}
   */
  moVoterOutreach: Object.freeze({
    url: 'https://voteroutreach.sos.mo.gov/PRD/VoterOutreach/VOSearch.aspx',
    source: 'docs/raw/instant_app_config.json',
    lastVerified: '2026-10-21',
  }),
});
