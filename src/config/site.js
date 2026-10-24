// The site's own address, which does not change between elections.

/** The production origin. Share links always use it, so a link copied from a
 * preview or a local build still works after that build is gone. */
export const siteUrl = 'https://mapthevotestl.com';

/**
 * The Google Analytics 4 measurement ID, like `G-ABC123DEF4` (#69). Empty
 * means analytics is off: nothing loads and the privacy notice says the site
 * has no analytics. Before setting it, apply the GA property settings in the
 * README (Privacy, Google Analytics): the app's own page views are redacted,
 * but GA's enhanced measurement would send real URLs.
 */
export const gaMeasurementId = '';

/**
 * The link to a precinct's results: only the precinct code, never the address
 * or the coordinates that found it.
 * @param {string} code A precinct code like CC007.
 */
export function shareUrl(code) {
  return `${siteUrl}/p/${code}`;
}
