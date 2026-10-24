// Turns the built app shell (dist/index.html) into one pre-rendered page
// (#99): the page's own title, description, canonical, Open Graph and card
// tags in the head, in place of the shell's (#98), and its server-rendered
// markup in the root. The root is marked with the path it was rendered for,
// so src/main.jsx hydrates it only there.

import { headTags } from '../pageHead.js';

const TITLE = /<title>[^<]*<\/title>/;
const DESCRIPTION = /\n?[ \t]*<meta\s+name="description"\s+content="[^"]*"\s*\/?>/;
// The shell's Open Graph and card tags (#98), which the page's own replace.
const SHELL_TAGS =
  /\n?[ \t]*<meta\s+(?:property="og:[^"]*"|name="twitter:[^"]*")\s+content="[^"]*"\s*\/?>/g;
const ROOT = '<div id="root"></div>';

const escapeText = (value) =>
  String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
const escapeAttr = (value) => escapeText(value).replaceAll('"', '&quot;');

function tagHtml({ tag, attrs }) {
  const attributes = Object.entries(attrs)
    .map(([name, value]) => ` ${name}="${escapeAttr(value)}"`)
    .join('');
  return `<${tag}${attributes}>`;
}

/**
 * @param {string} template The built index.html.
 * @param {{ path: string, head: { title: string, description: string, canonical?: string },
 *   html: string }} page `html` is renderToString's output for `path`.
 * @returns {string}
 */
export function renderPage(template, { path, head, html }) {
  for (const [name, found] of [
    ['title', TITLE.test(template)],
    ['description', DESCRIPTION.test(template)],
    ['root', template.includes(ROOT)],
  ]) {
    if (!found) throw new Error(`Cannot pre-render ${path}: index.html has no ${name} to replace`);
  }
  const tags = headTags(head).map(tagHtml).join('\n    ');
  return template
    .replace(DESCRIPTION, '')
    .replace(SHELL_TAGS, '')
    .replace(TITLE, () => `<title>${escapeText(head.title)}</title>\n    ${tags}`)
    .replace(ROOT, () => `<div id="root" data-prerendered="${escapeAttr(path)}">${html}</div>`);
}
