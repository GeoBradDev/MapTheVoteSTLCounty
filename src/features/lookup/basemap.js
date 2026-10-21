// The map's basemap: OpenFreeMap's Positron style (issue #13). Free, with no
// API key or account, and its terms (https://openfreemap.org/tos/) allow
// embedding it in a website. Style, tiles, sprites and glyphs all come from
// one origin, which render.yaml's Content-Security-Policy allows in
// connect-src. To change the basemap, change this file and the
// policy together.

/**
 * The MapLibre style URL. Positron is light gray; its water labels are blue,
 * so precinctMapView.js draws every label in the muted token. When changing
 * the style, check its fill and line colors for red or blue too.
 */
export const BASEMAP_STYLE_URL = 'https://tiles.openfreemap.org/styles/positron';

/**
 * Credits the tiles require (the style's TileJSON attribution) and
 * OpenStreetMap's license asks for, shown as text links under the map.
 */
export const BASEMAP_ATTRIBUTION = [
  { label: 'OpenFreeMap', href: 'https://openfreemap.org/' },
  { label: '© OpenMapTiles', href: 'https://www.openmaptiles.org/' },
  { label: '© OpenStreetMap contributors', href: 'https://www.openstreetmap.org/copyright' },
];
