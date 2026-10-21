// Reads the sample ballot link out of a precinct's `html` field. The field is
// either a link like
//   Sample Ballot: <a href=https://.../items/<id>/data>CC-007.pdf</a>
// or a plain message, such as the one for nonresidential precincts. Never
// render the field as HTML: show the result of this parser as text.
import election from '../config/election.js';

const COMMENT = /<!--[\s\S]*?(?:-->|$)/g;

// An opening <a> tag. Quoted attribute values may hold a `>`.
const ANCHOR = /<a(?=[\s/>])((?:"[^"]*"|'[^']*'|[^"'>])*)>/gi;

// Any start of an <a> tag, finished or not.
const ANCHOR_START = /<a[\s/]/i;

// One attribute: a name and an optional unquoted, single- or double-quoted
// value. Whitespace and `/` separate attributes, as in a browser.
const ATTRIBUTE = /([^\s"'>/=]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+)))?/g;

// A tag: < then a letter or /. A lone < or > in text is kept.
const TAG = /<\/?[a-z][^<>]*>/gi;

const CLOSE_ANCHOR = /<\/a\s*>/i;

// Tags become spaces, then whitespace collapses. Returns null when nothing is left.
function plainText(text) {
  const plain = text.replace(TAG, ' ').replace(/\s+/g, ' ').trim();
  return plain || null;
}

// The href of an opening tag's attribute text, or undefined when it has none.
function hrefOf(attributes) {
  for (const [, name, double, single, bare] of attributes.matchAll(ATTRIBUTE)) {
    if (name.toLowerCase() === 'href') return double ?? single ?? bare ?? '';
  }
  return undefined;
}

/**
 * @typedef {{ url: string, fileName: string | null }} SampleBallotLink
 * @typedef {{ message: string | null }} SampleBallotMessage
 */

/**
 * Parses a precinct's `html` field. Never throws.
 * @param {unknown} html The field as the data client returns it (a string or null).
 * @returns {SampleBallotLink | SampleBallotMessage} `{ url, fileName }` when the
 *   field's first link with an href points at a sample ballot whose URL matches
 *   `election.sampleBallotUrlPattern`; otherwise `{ message }` with the field as
 *   plain text. A link that fails the pattern, an unfinished link tag, or an
 *   empty field gives `{ message: null }`: there is nothing safe to show.
 */
export function parseSampleBallot(html) {
  if (typeof html !== 'string') return { message: null };
  const source = html.replace(COMMENT, ' ');

  for (const match of source.matchAll(ANCHOR)) {
    const url = hrefOf(match[1]);
    if (url === undefined) continue;
    if (!election.sampleBallotUrlPattern.test(url)) return { message: null };
    // The link text runs from the end of the opening tag to the closing </a>.
    const text = source.slice(match.index + match[0].length);
    const close = text.search(CLOSE_ANCHOR);
    return { url, fileName: plainText(close === -1 ? text : text.slice(0, close)) };
  }

  // No finished link. Markup from an unfinished one is not shown.
  if (ANCHOR_START.test(source)) return { message: null };
  return { message: plainText(source) };
}
