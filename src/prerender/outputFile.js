/**
 * The file a pre-rendered page is written to (#99), relative to the output
 * directory: a directory index, which Render serves at the path with or
 * without a trailing slash.
 * @param {string} route Such as `/` or `/learn/voter-id`.
 */
export function outputFile(route) {
  return route === '/' ? 'index.html' : `${route.slice(1)}/index.html`;
}
