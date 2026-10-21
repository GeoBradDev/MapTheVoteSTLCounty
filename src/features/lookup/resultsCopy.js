// All the results screen text, kept in one file so the i18n work (#19) can move
// it to en.json without touching the markup. Facts about the voter's precinct
// come from the county's data, never from here.
export const copy = {
  /** @param {string} code */
  heading: (code) => `Precinct ${code}`,
  // For a URL whose text is not a precinct code: never echo that text.
  notFoundHeading: 'Precinct not found',
  unincorporated: 'Unincorporated St. Louis County',
  searchAnother: 'Search another address',
  /** @param {string} code */
  ready: (code) => `Results for precinct ${code} are ready.`,
  officialLookup: "county's official lookup",
  status: {
    label: 'Precinct status',
    nonresidentialFallback:
      'This is a nonresidential precinct: it has no residential addresses for voting. For questions, contact the',
    countySite: 'St. Louis County Board of Elections',
    notInElection: 'There is nothing on the ballot in this precinct for this election.',
    unknown: 'We could not confirm whether this precinct votes in this election. Check the',
  },
  cards: {
    polls: 'Polling places near you',
    ballot: 'Sample ballot',
    earlyVoting: 'Early voting',
    districts: 'Your districts',
    // Until each card is built (#12, #14, #16, #15).
    pending: 'For now, find this in the',
  },
  errors: {
    notFound: 'We could not find that precinct. Search for your address, or use the',
    failed: 'We could not load this precinct right now. Try again, or use the',
  },
};
