// Pure helpers for the precinct map, kept out of the MapLibre module so they
// can be tested without WebGL. They ship in the map chunk with it.

function rings(geometry) {
  if (geometry?.type === 'Polygon') return geometry.coordinates ?? [];
  if (geometry?.type === 'MultiPolygon') return (geometry.coordinates ?? []).flat();
  return [];
}

/**
 * The box that holds a precinct outline and a set of points, for fitting the
 * map to them.
 * @param {{ geometry?: object | null,
 *   points?: ({ lat: number, lng: number } | null)[] }} parts
 * @returns {[[number, number], [number, number]] | null} [[west, south],
 *   [east, north]] in lng/lat, or null when there is nothing to show.
 */
export function mapBounds({ geometry, points = [] }) {
  let west = Infinity;
  let south = Infinity;
  let east = -Infinity;
  let north = -Infinity;
  const add = (lng, lat) => {
    if (!Number.isFinite(lng) || !Number.isFinite(lat)) return;
    west = Math.min(west, lng);
    east = Math.max(east, lng);
    south = Math.min(south, lat);
    north = Math.max(north, lat);
  };
  for (const ring of rings(geometry)) {
    for (const position of Array.isArray(ring) ? ring : []) {
      if (Array.isArray(position)) add(position[0], position[1]);
    }
  }
  for (const point of points) add(point?.lng, point?.lat);
  return west <= east
    ? [
        [west, south],
        [east, north],
      ]
    : null;
}

const encode = (linear) => {
  const c = Math.min(1, Math.max(0, linear));
  const srgb = c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055;
  return Math.round(srgb * 255);
};

/**
 * An `oklch()` color token as an sRGB `rgb()` string. MapLibre's style parser
 * does not read oklch, and colors are defined only as oklch tokens in
 * src/index.css, so the map converts them at runtime.
 * @param {string | undefined} value Like "oklch(0.42 0.07 165)".
 * @returns {string | null} Like "rgb(32, 89, 67)", or null when not oklch.
 */
export function oklchToRgb(value) {
  const m = String(value ?? '')
    .trim()
    .match(/^oklch\(\s*([\d.]+)(%?)\s+([\d.]+)\s+(-?[\d.]+)(?:deg)?\s*\)$/i);
  if (!m) return null;
  const L = Number(m[1]) / (m[2] ? 100 : 1);
  const C = Number(m[3]);
  const h = (Number(m[4]) * Math.PI) / 180;
  if (![L, C, h].every(Number.isFinite)) return null;
  const a = C * Math.cos(h);
  const b = C * Math.sin(h);
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const mm = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3;
  const r = 4.0767416621 * l - 3.3077115913 * mm + 0.2309699292 * s;
  const g = -1.2684380046 * l + 2.6097574011 * mm - 0.3413193965 * s;
  const bl = -0.0041960863 * l - 0.7034186147 * mm + 1.707614701 * s;
  return `rgb(${encode(r)}, ${encode(g)}, ${encode(bl)})`;
}
