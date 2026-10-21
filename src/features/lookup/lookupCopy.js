// The lookup's own messages, kept in one file so the i18n work (#19) can move
// them to en.json without touching the markup. Each error is followed by a
// link to the county's official lookup.
export const copy = {
  officialLookup: "county's official lookup",
  errorAfterLink: 'You can also use the',
  errors: {
    noMatch:
      'We could not find that address. Add your ZIP code, pick a suggestion as you type, or try Use my location.',
    unavailable: 'Address search is not available right now. Use my location instead.',
    failed: 'We could not look up your precinct right now. Try again.',
  },
  // The credit next to the address box. The service and data names and links
  // come from the geocoder module (attribution in src/data/geocoder.js).
  attribution: {
    searchBy: 'Address search:',
    then: 'or, when needed,',
    by: 'by',
    data: 'data \u00a9',
    cityCheck: 'An address found outside St. Louis City is also checked with the',
    privacy:
      'Your address is sent only to these services, to find your precinct. This site does not save it.',
  },
};
