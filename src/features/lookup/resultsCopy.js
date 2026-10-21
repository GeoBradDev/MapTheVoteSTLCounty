// All the results screen text, kept in one file so the i18n work (#19) can move
// it to en.json without touching the markup. Facts about the voter's precinct
// come from the county's data, never from here.

/**
 * A 24-hour HH:MM time as voters read it: 06:00 is "6 a.m.", 16:30 is "4:30 p.m.".
 * @param {string} time
 */
export function formatTime(time) {
  const [hours, minutes] = time.split(':').map(Number);
  const suffix = hours < 12 ? 'a.m.' : 'p.m.';
  const hour = hours % 12 === 0 ? 12 : hours % 12;
  return minutes ? `${hour}:${String(minutes).padStart(2, '0')} ${suffix}` : `${hour} ${suffix}`;
}

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
    // Until each card is built (#16).
    pending: 'For now, find this in the',
  },
  polls: {
    listLabel: 'Nearest polling places',
    /** @param {string} code */
    fromCenter: (code) =>
      `Distances are from the center of precinct ${code}. Search your address to measure from your home.`,
    /** @param {string | null} loc */
    unnamed: (loc) => (loc ? `Polling place ${loc}` : 'Polling place'),
    /** @param {number} miles */
    distance: (miles) => {
      if (miles < 0.05) return 'Less than 0.1 miles away';
      const rounded = miles.toFixed(1);
      return `${rounded} ${rounded === '1.0' ? 'mile' : 'miles'} away`;
    },
    /** @param {string | null} address @param {string | null} zip */
    address: (address, zip) => [address, zip && `MO ${zip}`].filter(Boolean).join(', '),
    directions: 'Get directions',
    appleMaps: 'Apple Maps',
    /** @param {string} name For screen readers: which place the link is for. */
    linkTarget: (name) => `to ${name}`,
    showMore: 'Show more polling places',
    hoursLabel: 'Election Day hours:',
    /** @param {string} open HH:MM @param {string} close HH:MM */
    // No closing period: every time already ends in "a.m." or "p.m.".
    hours: (open, close) => `${formatTime(open)} to ${formatTime(close)}`,
    /** @param {string} close HH:MM */
    inLine: (close) => `If you are in line at ${formatTime(close)}, you can still vote.`,
    voteAnywhere: 'You can vote at any polling place in St. Louis County.',
    source: 'Source',
    // Link text for a source, by its host. Anything else shows its host.
    sourceNames: {
      'revisor.mo.gov': 'Missouri law',
      'stlouiscovotes.info': 'St. Louis County Board of Elections',
    },
    failed: 'We could not load polling places right now. Find them with the',
    none: 'We could not find polling places near here. Find them with the',
  },
  ballot: {
    // Neutral on purpose: what the document holds, nothing about candidates.
    intro: 'The sample ballot shows the contests and measures on your ballot.',
    open: 'Open your sample ballot (PDF)',
    // Read after the link text and file name by screen readers only. The
    // county serves the PDF as a download, so most browsers save it rather
    // than show it in the new tab.
    newTab: '(opens a PDF in a new tab, or downloads it)',
    missing: 'We could not find the sample ballot for this precinct. Find it with the',
  },
  districts: {
    // Row labels, keyed like `districtFields` in the election config. Values
    // come from the county's precinct data.
    labels: {
      congressional: 'U.S. House',
      stateSenate: 'State Senate',
      stateHouse: 'State House',
      countyCouncil: 'County Council',
      municipality: 'Municipality',
      // Some cities number council districts instead of wards, such as
      // "City of Ellisville District 1".
      ward: 'City ward or district',
      township: 'Township',
      school: 'School district',
      juniorCollege: 'Community college subdistrict',
      fire: 'Fire protection district',
      ambulance: 'Ambulance district',
      ambulanceSubdistrict: 'Ambulance subdistrict',
      library: 'Library district',
      sewer: 'Sewer district',
      light: 'Light district',
      road: 'Road district',
      communityImprovement: 'Community improvement district',
      business: 'Business district',
      transportation: 'Transportation development district',
      neighborhoodImprovement: 'Neighborhood improvement district',
      annexation: 'Annexation area',
    },
    source: 'From the St. Louis County Board of Elections precinct data.',
    missing: 'We could not find the districts for this precinct. Find them with the',
  },
  map: {
    /** @param {string} code */
    label: (code) => `Map of precinct ${code} and nearby polling places`,
    /** @param {string} code */
    legend: (code) =>
      `The shaded area is precinct ${code}. Numbers on the map match the list below.`,
    origin: 'The dark dot is your address or location.',
    basemap: 'Map:',
    data: 'Precinct and polling place data:',
    county: 'St. Louis County Board of Elections',
  },
  errors: {
    notFound: 'We could not find that precinct. Search for your address, or use the',
    failed: 'We could not load this precinct right now. Try again, or use the',
  },
};
