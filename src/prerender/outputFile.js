/**
 * The file a pre-rendered page is written to (#99), relative to the output
 * directory: a directory index. Render serves it only at the path with a
 * trailing slash, so render.yaml rewrites the path without one to this file.
 * @param {string} route Such as `/` or `/learn/voter-id`.
 */
export function outputFile(route) {
  return route === '/' ? 'index.html' : `${route.slice(1)}/index.html`;
}
