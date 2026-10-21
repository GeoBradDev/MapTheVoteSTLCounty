// The lookup's own messages, kept in one file so the i18n work (#19) can move
// them to en.json without touching the markup. Each error is followed by a
// link to the county's official lookup.
export const copy = {
  officialLookup: "county's official lookup",
  errorAfterLink: 'You can also use the',
  errors: {
    noMatch:
      'We could not find that address. Check the street number and name, pick a suggestion as you type, or try Use my location.',
    unavailable: 'Address search is not available right now. Use my location instead.',
    failed: 'We could not look up your precinct right now. Try again.',
  },
  // The credit next to the address box. The service and data names and links
  // come from the geocoder module (attribution in src/data/geocoder.js).
  attribution: {
    searchBy: 'Address search by',
    by: 'by',
    data: 'Data \u00a9',
    privacy: 'Your address goes only to that service, to find your precinct, and is not saved.',
  },
};
