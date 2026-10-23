import { lazy } from 'react';
import { loadCityClient } from '../../data/jurisdictions.js';

/**
 * A City-only component from the City chunk (src/cityChunk.js), for a City
 * precinct's cards. Render it inside a Suspense boundary. The chunk is the one
 * the City data already loaded, so no new request is made (#147).
 * @param {string} name The chunk's export, like `CityEarlyVotingCard`.
 */
export function cityComponent(name) {
  return lazy(() => loadCityClient().then((chunk) => ({ default: chunk[name] })));
}
