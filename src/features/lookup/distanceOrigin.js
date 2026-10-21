// Where the results cards measure distances from: the looked-up point when
// there is one, else the precinct's center.
import { getPrecinctGeometry } from '../../data/arcgis.js';
import { polygonCenter } from './nearbyPolls.js';

async function precinctCenter(code) {
  const feature = await getPrecinctGeometry(code);
  const center = polygonCenter(feature?.geometry);
  if (!center) throw new Error(`No center for precinct ${code}`);
  return center;
}

/**
 * The point distances are measured from.
 * @param {string} code The precinct code.
 * @param {{ lat: number, lng: number } | null} origin The looked-up point,
 *   held in memory only; null for a reload or a shared link.
 * @returns {Promise<{ lat: number, lng: number }>}
 */
export function distanceOrigin(code, origin) {
  return origin ? Promise.resolve(origin) : precinctCenter(code);
}
