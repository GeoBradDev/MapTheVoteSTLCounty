// Reads the sample ballot link out of a precinct's `html` field. The field is
// either a link like
//   Sample Ballot: <a href=https://.../items/<id>/data>CC-007.pdf</a>
// or a plain message, such as the one for nonresidential precincts. Never
// render the field as HTML: show the result of this parser as text.
//
// This is not a full HTML parser. Anything it cannot read with confidence
// gives `{ message: null }`, so the worst case is showing nothing, never a
// wrong link or raw markup.
import election from '../config/election.js';

// HTML whitespace. Not \s, which also matches characters like a no-break
// space that a browser treats as part of a name.
const WS = '[\\t\\n\\f\\r ]';

const COMMENT = /<!--[\s\S]*?(?:-->|$)/g;

// Script and style bodies are not text.
const RAW_TEXT = /<(script|style)\b[\s\S]*?(?:<\/\1[^>]*>|$)/gi;

// Where an <a> tag starts, finished or not.
const ANCHOR_START = new RegExp(`<a(?=${WS}|[/>])`, 'gi');

// A whole opening <a> tag, read from where ANCHOR_START found one. Quoted
// attribute values may hold a `>`.
const ANCHOR = /<a((?:"[^"]*"|'[^']*'|[^"'<>])*)>/iy;

// One attribute: a name and an optional unquoted, single- or double-quoted
// value. Whitespace and `/` separate attributes, as in a browser.
const ATTRIBUTE = new RegExp(
  `([^\\t\\n\\f\\r "'>/=]+)(?:${WS}*=${WS}*(?:"([^"]*)"|'([^']*)'|([^\\t\\n\\f\\r "'>]+)))?`,
  'g',
);

// The end of the link text: a closing </a>, or another <a> starting.
const LINK_END = new RegExp(`</a(?:${WS}|/|>)|<a(?:${WS}|/|>)`, 'i');

// Tags, including ones with a `>` in a quoted value, and declarations like
// <!DOCTYPE>, CDATA and <?xml?>. A lone < or > in text is kept.
const TAG = /<\/?[a-z](?:"[^"]*"|'[^']*'|[^"'<>])*>|<[!?][^>]*>/gi;

// Tags and declarations become spaces, then whitespace collapses. Returns null
// when nothing is left.
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
 *   plain text. A link that fails the pattern, an `<a` tag that cannot be read,
 *   or an empty field gives `{ message: null }`: there is nothing safe to show.
 */
export function parseSampleBallot(html) {
  if (typeof html !== 'string') return { message: null };
  const source = html.replace(COMMENT, ' ').replace(RAW_TEXT, ' ');

  // Every <a> in order. One that cannot be read ends the search with nothing,
  // since a browser may see a link there that this parser does not.
  for (const start of source.matchAll(ANCHOR_START)) {
    ANCHOR.lastIndex = start.index;
    const match = ANCHOR.exec(source);
    if (!match) return { message: null };
    const url = hrefOf(match[1]);
    if (url === undefined) continue;
    if (!election.sampleBallotUrlPattern.test(url)) return { message: null };
    const text = source.slice(ANCHOR.lastIndex);
    const end = text.search(LINK_END);
    return { url, fileName: plainText(end === -1 ? text : text.slice(0, end)) };
  }

  return { message: plainText(source) };
}
