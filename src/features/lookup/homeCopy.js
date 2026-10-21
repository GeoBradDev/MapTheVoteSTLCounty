// All the home page text, kept in one file so the i18n work (#19) can move it
// to en.json without touching the markup. Election names and dates come from
// src/config/election.js, never from here.
export const copy = {
  heading: 'St. Louis County Voter Guide',
  intro: 'Find your precinct, polling places near you and your sample ballot.',
  /** @param {string} isoDate YYYY-MM-DD @param {string} timeZone */
  electionDay: (isoDate, timeZone) => {
    // Noon UTC is the same calendar day in every US time zone.
    const date = new Date(`${isoDate}T12:00:00Z`);
    const formatted = new Intl.DateTimeFormat('en-US', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      timeZone,
    }).format(date);
    return `Election Day is ${formatted}.`;
  },
  // The county FAQ's own sentence (issue #1), with "St." for "Saint".
  voteAnywhere: 'Voters in St. Louis County may vote at any polling place.',
  voteAnywhereSource: 'Source: St. Louis County Board of Elections',
  moreInfo: 'More information',
  howToVote: 'How to vote',
  countySite: 'St. Louis County Board of Elections website',
};
