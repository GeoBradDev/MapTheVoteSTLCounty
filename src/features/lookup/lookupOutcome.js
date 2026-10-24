// How a lookup ended, as the fixed labels Google Analytics counts (#70): the
// one place the lookup's outcome kinds map to them. Only the label is sent,
// never what was searched, where, or the precinct found.
import { track } from '../../analytics/index.js';

// locate()'s kinds (a City place with no City precinct is the City referral,
// #88) and the lookup's error keys (lookupCopy.js).
const OUTCOMES = {
  precinct: 'precinct',
  'county-unmatched': 'no_precinct',
  'stl-city': 'city_referral',
  missouri: 'out_of_area',
  'out-of-state': 'out_of_area',
  unknown: 'out_of_area',
  noMatch: 'no_match',
  unavailable: 'unavailable',
  failed: 'failed',
  offline: 'offline',
};

// The device's reasons (deviceLocation.js) worth telling apart; any other is
// the location being unavailable.
const DEVICE = { denied: 'denied', timeout: 'timeout', coarse: 'coarse' };

/**
 * Counts a finished lookup.
 * @param {'address' | 'location'} source
 * @param {string} kind A locate() kind or a lookup error key.
 */
export function trackLookup(source, kind) {
  if (Object.hasOwn(OUTCOMES, kind)) {
    track('lookup_result', { source, outcome: OUTCOMES[kind] });
  }
}

/**
 * Counts a Use my location press the device could not answer.
 * @param {string} reason
 */
export function trackDeviceFailure(reason) {
  const outcome = Object.hasOwn(DEVICE, reason) ? DEVICE[reason] : 'unavailable';
  track('lookup_result', { source: 'location', outcome });
}
