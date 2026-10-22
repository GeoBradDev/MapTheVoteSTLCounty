// Basemap tweaks shared by the precinct map and the wait times map (#104).
// Imported only by the map view modules, which load with MapLibre.

// Positron's interstate shield layer, and the gray shield its other roads use.
const INTERSTATE_SHIELDS = 'highway-shield-us-interstate';
const GRAY_SHIELD = ['concat', 'road_', ['get', 'ref_length']];

/**
 * The basemap's own colors are grays, except its blue water labels and its
 * slate-blue interstate shields. Draws every label in `labelColor`, so no
 * party color shows whatever the style changes, and interstates with the plain
 * gray road shield. Call on the map's `load`.
 * @param {import('maplibre-gl').Map} map
 * @param {string} labelColor An rgb() color.
 */
export function neutralizeBasemap(map, labelColor) {
  for (const layer of map.getStyle().layers) {
    if (layer.type !== 'symbol') continue;
    map.setPaintProperty(layer.id, 'text-color', labelColor);
    if (layer.id === INTERSTATE_SHIELDS) {
      map.setLayoutProperty(layer.id, 'icon-image', GRAY_SHIELD);
    }
  }
}
