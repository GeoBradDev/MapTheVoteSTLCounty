// The site's public pages (#97, #99): the ones in the sitemap, and the ones the
// build pre-renders to static HTML. One list for both, so a page cannot be in
// one and not the other. Precinct pages (/p/<code>) are never public pages:
// their data is live.

/**
 * @param {string[]} topicIds Every topic id in the default locale.
 * @returns {string[]} The home page, /learn, each topic by id and /privacy.
 */
export function publicPaths(topicIds) {
  const topics = [...topicIds].sort((a, b) => a.localeCompare(b)).map((id) => `/learn/${id}`);
  return ['/', '/learn', ...topics, '/privacy'];
}
