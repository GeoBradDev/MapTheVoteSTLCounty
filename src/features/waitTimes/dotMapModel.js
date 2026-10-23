// The home page dot map's model (#184): pure functions from the sites and
// counts the wait times page shows to what the map draws.
import { PROJECTION } from './outline.js';

/**
 * A point in the outline's view units.
 * @param {number} lng
 * @param {number} lat
 * @returns {[number, number]}
 */
export function project(lng, lat) {
  const { lng0, lat0, kx, scale, x0, y0 } = PROJECTION;
  return [x0 + (lng - lng0) * kx * scale, y0 + (lat0 - lat) * scale];
}
