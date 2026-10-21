// The lookup's own messages, kept in one file so the i18n work (#19) can move
// them to en.json without touching the markup. Each error is followed by a
// link to the county's official lookup.
export const copy = {
  officialLookup: "county's official lookup",
  errorAfterLink: 'You can also use the',
  // A lookup that could not finish (#18) never says the address was not
  // found: only noMatch does, and only when every source answered.
  errors: {
    noMatch:
      'We could not find that address. Check it, add your ZIP code, pick a suggestion as you type, or try Use my location.',
    unavailable:
      'Address search is not working right now, so we could not check that address. Try again in a minute, or try Use my location.',
    failed:
      "We could not look up your precinct right now. The county's services may be slow or down. Try again in a minute.",
    offline: 'You appear to be offline. Check your internet connection, then try again.',
  },
  // The credit next to the address box. The service and data names and links
  // come from the geocoder module (attribution in src/data/geocoder.js).
  attribution: {
    searchBy: 'Address search:',
    then: 'or, when needed,',
    by: 'by',
    data: 'data \u00a9',
    cityCheck: 'An address found outside St. Louis City may also be checked with the',
    privacy:
      'Your address is sent only to these services, to find your precinct. This site does not save it.',
  },
};
