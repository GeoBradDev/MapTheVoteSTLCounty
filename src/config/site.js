// The site's own address, which does not change between elections.

/** The production origin. Share links always use it, so a link copied from a
 * preview or a local build still works after that build is gone. */
export const siteUrl = 'https://mapthevotestl.com';

/**
 * The link to a precinct's results: only the precinct code, never the address
 * or the coordinates that found it.
 * @param {string} code A precinct code like CC007.
 */
export function shareUrl(code) {
  return `${siteUrl}/p/${code}`;
}
