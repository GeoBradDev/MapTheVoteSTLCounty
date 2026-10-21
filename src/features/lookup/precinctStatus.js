// What a precinct's `in_election` field means for the results screen: which
// banner to show and whether there is a sample ballot to offer.
import { parseSampleBallot } from '../../data/sampleBallot.js';

/**
 * @typedef {object} PrecinctStatus
 * @property {'in-election' | 'nonresidential' | 'not-in-election' | 'unknown'} kind
 * @property {string | null} message The county's own message, as plain text, for
 *   a nonresidential precinct. Null when there is none or it cannot be read safely.
 * @property {boolean} showBallot Whether the sample ballot card belongs on the page.
 */

const KINDS = {
  'in election': 'in-election',
  'nonresidential precinct': 'nonresidential',
  'not in election': 'not-in-election',
};

/**
 * @param {object | null | undefined} precinct Attributes from the data client.
 * @returns {PrecinctStatus}
 */
export function precinctStatus(precinct) {
  const value = precinct?.in_election;
  const key = typeof value === 'string' ? value.trim().toLowerCase().replace(/\s+/g, ' ') : '';
  const kind = Object.hasOwn(KINDS, key) ? KINDS[key] : 'unknown';
  // The field holds a message, never a link, for these precincts. Only the
  // parser's plain text is used, never the raw field.
  const message =
    kind === 'nonresidential' ? (parseSampleBallot(precinct?.html).message ?? null) : null;
  return {
    kind,
    message,
    showBallot: kind === 'in-election' || kind === 'unknown',
  };
}
