// A point inside a polygon, for asking which districts a precinct is in when a
// share link has no looked-up point (#87). Not the centroid: on 2026-10-22 the
// centroid of 2 of the City's 207 precincts fell outside them (docs/data.md).

const SCANLINES = 9;

/**
 * The middle of the widest stretch inside the polygon along a few horizontal
 * lines across it. Rings are read even-odd, so holes are kept out of, and a
 * MultiPolygon's widest stretch is in its larger parts.
 * @param {{ type: string, coordinates: number[][][] | number[][][][] } | null | undefined} geometry
 *   A GeoJSON Polygon or MultiPolygon in lng/lat.
 * @returns {{ lat: number, lng: number } | null} Null when there is no inside.
 */
export function interiorPoint(geometry) {
  let rings;
  if (geometry?.type === 'Polygon') rings = geometry.coordinates;
  else if (geometry?.type === 'MultiPolygon') rings = geometry.coordinates.flat();
  else return null;
  const points = rings.flat();
  if (!points.length) return null;
  const ys = points.map((p) => p[1]);
  const xSpan = Math.max(...points.map((p) => p[0])) - Math.min(...points.map((p) => p[0]));
  // Narrower than this is rounding, not an inside.
  const minWidth = xSpan * 1e-9;
  const low = Math.min(...ys);
  const high = Math.max(...ys);
  let best = null;
  for (let k = 1; k <= SCANLINES; k += 1) {
    const y = low + ((high - low) * k) / (SCANLINES + 1);
    const xs = [];
    for (const ring of rings) {
      for (let i = 0; i < ring.length - 1; i += 1) {
        const [x1, y1] = ring[i];
        const [x2, y2] = ring[i + 1];
        // Half-open, so a line through a vertex counts it once.
        if (y1 > y !== y2 > y) xs.push(x1 + ((y - y1) * (x2 - x1)) / (y2 - y1));
      }
    }
    xs.sort((a, b) => a - b);
    for (let i = 0; i + 1 < xs.length; i += 2) {
      const width = xs[i + 1] - xs[i];
      if (width > minWidth && (!best || width > best.width)) {
        best = { width, lng: (xs[i] + xs[i + 1]) / 2, lat: y };
      }
    }
  }
  return best && { lat: best.lat, lng: best.lng };
}
