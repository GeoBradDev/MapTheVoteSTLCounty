// The lookup's own messages, kept in one file so the i18n work (#19) can move
// them to en.json without touching the markup. Each error is followed by a
// link to the county's official lookup.
export const copy = {
  officialLookup: "county's official lookup",
  errorAfterLink: 'You can also use the',
  errors: {
    noMatch:
      'We could not find that address. Check the street number and name, or pick a suggestion as you type.',
    unavailable: 'Address search is not available right now. Use my location instead.',
    failed: 'We could not look up your precinct right now. Try again.',
  },
};
