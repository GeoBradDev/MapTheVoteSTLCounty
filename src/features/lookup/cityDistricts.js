// Which districts a City precinct is in, as the City districts card shows them
// (#90). Every value is the City districts layer's own `district` text, trimmed;
// the office is only used to pick the row and is never shown. In the City chunk
// (src/cityChunk.js).
import cityResults from '../../config/cityResults.js';
import { copy } from './resultsCopy.js';

// A party's name or initial in brackets. No row the card reads holds one, but a
// value that does is dropped rather than shown: the card never names a party.
const PARTY =
  /\((?:R|D|L|C|G)\)|\b(?:republicans?|democrat(?:s|ic)?|libertarians?|green party|constitution party)\b/i;

/**
 * The rows to list, in the config's order, with empty and party values left
 * out. A row lists every different value the answer has for it, so two
 * districts for one office are never shown as one.
 * @param {{ office: string | null, name: string | null }[] | null | undefined} districts
 *   The districts at a point inside the precinct (getCityDistrictsForPrecinct).
 * @returns {{ key: string, label: string, values: string[] }[]}
 */
export function cityDistrictRows(districts) {
  if (!Array.isArray(districts)) return [];
  return cityResults.districts.rows.flatMap(({ key, offices }) => {
    const values = [];
    for (const { office, name } of districts) {
      if (!offices.includes(office) || typeof name !== 'string') continue;
      const value = name.trim();
      if (value && !PARTY.test(value) && !values.includes(value)) values.push(value);
    }
    return values.length ? [{ key, label: copy.districts.labels[key], values }] : [];
  });
}
