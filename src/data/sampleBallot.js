// Reads the sample ballot link out of a precinct's `html` field. The field is
// either a link like
//   Sample Ballot: <a href=https://.../items/<id>/data>CC-007.pdf</a>
// or a plain message, such as the one for nonresidential precincts. Never
// render the field as HTML: show the result of this parser as text.
//
// This is a small, strict reader, not a full HTML parser. It knows plain text,
// comments and a few simple formatting tags. Anything else (another tag, a
// declaration, a tag it cannot read to its end, a quote or < where a browser
// would report a parse error) gives `{ message: null }`, so the worst case is
// showing nothing, never a wrong link or raw markup.
import election from '../config/election.js';

// Tags the field may use. Block tags separate words; inline tags do not.
const INLINE_TAGS = new Set(['a', 'b', 'i', 'u', 'em', 'strong', 'small', 'span', 'font']);
const BLOCK_TAGS = new Set(['br', 'p', 'div']);

// HTML whitespace. Not \s, which also matches characters like a no-break
// space that a browser treats as part of a name.
const isSpace = (c) => c === ' ' || c === '\t' || c === '\n' || c === '\f' || c === '\r';
const isLetter = (c) => /^[a-z]$/i.test(c ?? '');

/**
 * @typedef {{ type: 'text', text: string }
 *   | { type: 'tag', name: string, closing: boolean, attributes: Map<string, string> }
 * } Token
 */

// Reads one tag starting at `start` (a `<`). Returns the token and the index
// after it, or null when the tag cannot be read with confidence.
function readTag(html, start) {
  let i = start + 1;
  const closing = html[i] === '/';
  if (closing) i += 1;
  const nameStart = i;
  while (i < html.length && !isSpace(html[i]) && html[i] !== '/' && html[i] !== '>') i += 1;
  const name = html.slice(nameStart, i).toLowerCase();
  if (!/^[a-z][a-z0-9]*$/.test(name)) return null;
  if (!INLINE_TAGS.has(name) && !BLOCK_TAGS.has(name)) return null;

  const attributes = new Map();
  for (;;) {
    while (i < html.length && (isSpace(html[i]) || html[i] === '/')) i += 1;
    if (i >= html.length) return null;
    if (html[i] === '>') break;

    const attrStart = i;
    while (i < html.length && !isSpace(html[i]) && !'/>='.includes(html[i])) i += 1;
    const attr = html.slice(attrStart, i).toLowerCase();
    if (!attr || /["'<]/.test(attr)) return null;

    let value = '';
    let j = i;
    while (j < html.length && isSpace(html[j])) j += 1;
    if (html[j] === '=') {
      j += 1;
      while (j < html.length && isSpace(html[j])) j += 1;
      const quote = html[j];
      if (quote === '"' || quote === "'") {
        const end = html.indexOf(quote, j + 1);
        if (end === -1) return null;
        value = html.slice(j + 1, end);
        j = end + 1;
      } else {
        const valueStart = j;
        while (j < html.length && !isSpace(html[j]) && html[j] !== '>') j += 1;
        value = html.slice(valueStart, j);
        if (/["'<=`]/.test(value)) return null;
      }
      i = j;
    }
    // As in a browser, the first of two same-named attributes wins.
    if (!attributes.has(attr)) attributes.set(attr, value);
  }
  return { token: { type: 'tag', name, closing, attributes }, end: i + 1 };
}

// The field as text and tag tokens, or null when any of it cannot be read.
// Comments are dropped.
function tokenize(html) {
  /** @type {Token[]} */
  const tokens = [];
  let i = 0;
  while (i < html.length) {
    if (html[i] !== '<') {
      const next = html.indexOf('<', i);
      const end = next === -1 ? html.length : next;
      tokens.push({ type: 'text', text: html.slice(i, end) });
      i = end;
      continue;
    }
    const next = html[i + 1];
    if (html.startsWith('<!--', i)) {
      // <!--> and <!---> are empty comments to a browser.
      if (html.startsWith('<!-->', i)) i += 5;
      else if (html.startsWith('<!--->', i)) i += 6;
      else {
        const end = html.indexOf('-->', i + 4);
        if (end === -1) return null;
        i = end + 3;
      }
    } else if (isLetter(next) || (next === '/' && isLetter(html[i + 2]))) {
      const tag = readTag(html, i);
      if (!tag) return null;
      tokens.push(tag.token);
      i = tag.end;
    } else if (next === '!' || next === '?' || next === '/') {
      // A declaration, processing instruction or bogus comment.
      return null;
    } else {
      // A lone < in text, as in "under < 18".
      tokens.push({ type: 'text', text: '<' });
      i += 1;
    }
  }
  return tokens;
}

// Joins tokens as a browser would show them, collapsing whitespace. Returns
// null when nothing is left.
function plainText(tokens) {
  const text = tokens
    .map((t) => (t.type === 'text' ? t.text : BLOCK_TAGS.has(t.name) ? ' ' : ''))
    .join('')
    .replace(/\s+/g, ' ')
    .trim();
  return text || null;
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
 *   plain text. A link that fails the pattern, markup this reader does not
 *   know, or an empty field gives `{ message: null }`: there is nothing safe
 *   to show.
 */
export function parseSampleBallot(html) {
  if (typeof html !== 'string') return { message: null };
  const tokens = tokenize(html);
  if (!tokens) return { message: null };

  const isAnchor = (t) => t.type === 'tag' && t.name === 'a';
  const link = tokens.findIndex((t) => isAnchor(t) && !t.closing && t.attributes.has('href'));
  if (link === -1) return { message: plainText(tokens) };

  const url = tokens[link].attributes.get('href');
  if (!election.sampleBallotUrlPattern.test(url)) return { message: null };
  // The link text runs to the closing </a>, or to the next <a>.
  const rest = tokens.slice(link + 1);
  const end = rest.findIndex(isAnchor);
  return { url, fileName: plainText(end === -1 ? rest : rest.slice(0, end)) };
}
