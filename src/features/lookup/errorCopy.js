// The words the error states share (#18), kept in one file so the i18n work
// (#19) can move them to en.json without touching the markup.
export const copy = {
  retry: 'Try again',
  retrying: 'Trying again...',
  // Shown, and announced, after a lookup or a page has waited SLOW_MS.
  slow: 'Still working... This is taking longer than usual.',
};

/** Whether the browser says it has no network connection. */
export function isOffline() {
  return globalThis.navigator?.onLine === false;
}
