// The map's basemap: OpenFreeMap's Positron style (issue #13). Free, with no
// API key or account, and its terms (https://openfreemap.org/tos/) allow
// embedding it in a website. Style, tiles, sprites and glyphs all come from
// one origin, which render.yaml's Content-Security-Policy allows in
// connect-src. To change the basemap, change this file and the
// policy together.

/**
 * The MapLibre style URL. Positron is light gray; its water labels are blue
 * and its interstate shields slate blue, so mapStyle.js (for both maps) draws
 * every label in the muted token and interstates with the gray road shield. When
 * changing the style, check its fill, line and text colors and its sprite
 * icons for red or blue.
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
