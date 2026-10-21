// All the "Use my location" text, kept in one file so the i18n work (#19) can
// move it to en.json without touching the markup.
export const copy = {
  button: 'Use my location',
  busy: 'Finding your location...',
  privacy: 'Your location is used only to find your precinct. This site does not save it.',
  notHome:
    'Results are for where your device is now, which may not be your home address. Your ballot is based on the address where you are registered to vote.',
  errors: {
    denied: 'Location access is turned off for this site. Type your address instead.',
    timeout: 'Finding your location took too long. Try again, or type your address instead.',
    unavailable: 'Your location could not be found. Try again, or type your address instead.',
    insecure: 'Location works only on a secure (HTTPS) page. Type your address instead.',
    unsupported: 'This browser cannot share your location. Type your address instead.',
  },
};
