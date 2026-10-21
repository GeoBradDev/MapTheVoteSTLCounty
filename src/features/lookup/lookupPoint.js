// Hands the looked-up point from the search to the precinct page, so the
// polling places card can measure from the voter's own address. It lives only
// in this module's memory: never in the URL, history state or any storage, so
// a reload or a shared link has no point and the card measures from the
// precinct's center instead.

/** @type {{ code: string, point: { lat: number, lng: number } } | null} */
let latest = null;

/**
 * Remembers the point of the lookup that found this precinct, replacing any
 * earlier one. A point without numeric coordinates clears it.
 * @param {string} code
 * @param {{ lat: number, lng: number }} point
 */
export function rememberLookupPoint(code, { lat, lng } = {}) {
  latest = Number.isFinite(lat) && Number.isFinite(lng) ? { code, point: { lat, lng } } : null;
}

/**
 * The remembered point, when the latest lookup found this precinct.
 * @param {string} code
 * @returns {{ lat: number, lng: number } | null}
 */
export function lookupPointFor(code) {
  return latest && latest.code === code ? { ...latest.point } : null;
}

/**
 * Forgets the remembered point. Every new search calls it when it starts
 * (#53), so a failed search never leaves an earlier voter's point behind.
 */
export function forgetLookupPoint() {
  latest = null;
}
