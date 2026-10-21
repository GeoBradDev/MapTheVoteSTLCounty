// All the out-of-county notice's text, one entry per kind from locate(). Kept
// in one file so the i18n work (#19) can move it to en.json without touching
// the markup. A paragraph is text, optionally followed by a link (by its key in
// the notice's HREFS) and more text.
export const copy = {
  'stl-city': {
    heading: 'This address is in the City of St. Louis',
    paragraphs: [
      {
        text: 'The City of St. Louis is separate from St. Louis County and has its own election board. For your polling place, sample ballot and registration, go to the',
        link: { href: 'stlCityBoard', label: 'St. Louis City Board of Election Commissioners' },
        after: '.',
      },
    ],
  },
  missouri: {
    heading: 'This address is outside St. Louis County',
    paragraphs: [
      {
        text: 'This guide covers St. Louis County only. To find your polling place and sample ballot anywhere in Missouri, use the',
        link: {
          href: 'moVoterOutreach',
          label: 'Missouri Secretary of State Voter Outreach Center',
        },
        after: '.',
      },
    ],
  },
  'out-of-state': {
    heading: 'This address is outside Missouri',
    paragraphs: [
      {
        text: 'This guide covers St. Louis County, Missouri only. Your local election office can tell you where and how to vote.',
      },
    ],
  },
  unknown: {
    heading: 'This location is outside St. Louis County',
    paragraphs: [
      {
        text: 'This guide covers St. Louis County only. If you vote anywhere else in Missouri, including the City of St. Louis, use the',
        link: {
          href: 'moVoterOutreach',
          label: 'Missouri Secretary of State Voter Outreach Center',
        },
        after: '.',
      },
      { text: 'Outside Missouri, your local election office can tell you where and how to vote.' },
    ],
  },
  'county-unmatched': {
    heading: 'We could not find a precinct for this location',
    paragraphs: [
      {
        text: 'It looks like this location is in St. Louis County, but no voting precinct matched it. Find your precinct with the',
        link: { href: 'countyLookup', label: "county's official lookup" },
        after: '.',
      },
    ],
  },
};
