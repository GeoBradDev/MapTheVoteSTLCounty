// Reads the sample ballot link out of a precinct's `html` field. The field is
// either a link like
//   Sample Ballot: <a href=https://.../items/<id>/data>CC-007.pdf</a>
// or a plain message, such as the one for nonresidential precincts. Never
// render the field as HTML: show the result of this parser as text.
import election from '../config/election.js';

// The first href attribute: unquoted, single-quoted or double-quoted. It must
// follow whitespace, so an attribute like data-href does not count.
const HREF = /\shref\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+))/i;

const NO_MESSAGE = Object.freeze({ message: null });

// Tags become spaces, then whitespace collapses. Returns null when nothing is left.
function plainText(text) {
  const plain = text
    .replace(/<[^>]*>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return plain || null;
}

/**
 * @typedef {{ url: string, fileName: string | null }} SampleBallotLink
 * @typedef {{ message: string | null }} SampleBallotMessage
 */

/**
 * Parses a precinct's `html` field. Never throws.
 * @param {unknown} html The field as the data client returns it (a string or null).
 * @returns {SampleBallotLink | SampleBallotMessage} `{ url, fileName }` when the
 *   field links to a sample ballot whose URL matches
 *   `election.sampleBallotUrlPattern`; otherwise `{ message }` with the field as
 *   plain text. A link that fails the pattern, or an empty field, gives
 *   `{ message: null }`: there is nothing safe to show.
 */
export function parseSampleBallot(html) {
  if (typeof html !== 'string') return NO_MESSAGE;
  // Prefix a space so an href at the very start still follows whitespace.
  const source = ` ${html}`;
  const match = HREF.exec(source);
  if (!match) return { message: plainText(html) };

  const url = match[1] ?? match[2] ?? match[3];
  if (!election.sampleBallotUrlPattern.test(url)) return NO_MESSAGE;

  // The link text runs from the end of the opening tag to the closing </a>.
  const rest = source.slice(match.index + match[0].length);
  const tagEnd = rest.indexOf('>');
  let fileName = null;
  if (tagEnd !== -1) {
    const text = rest.slice(tagEnd + 1);
    const close = text.search(/<\/a\s*>/i);
    fileName = plainText(close === -1 ? text : text.slice(0, close));
  }
  return { url, fileName };
}
