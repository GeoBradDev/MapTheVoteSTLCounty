// Which districts a precinct is in, as the districts card shows them. Every
// value is the county precinct layer's own text: the rules below only trim it,
// drop a placeholder, or reword "Unincorporated". Nothing else is added.
import election from '../../config/election.js';
import { copy } from './resultsCopy.js';

// Display rules by row key. Each returns the text to show, or null to hide the row.
const RULES = {
  // "US Representative District 2 (2025)": the year names the map, not the district.
  congressional: (value) => value.replace(/\s*\(\d{4}\)$/, ''),
  municipality: (value) => (value.toLowerCase() === 'unincorporated' ? copy.unincorporated : value),
  // One school district's value carries how its board is elected. The card
  // shows the district's name only.
  school: (value) => value.replace(/^cumulative voting\s*-\s*/i, ''),
  // A placeholder, not a district.
  sewer: (value) => (value.toLowerCase() === 'no sewer district' ? null : value),
};

/**
 * The districts to list for a precinct, in the config's order, with empty
 * values left out.
 * @param {object | null | undefined} precinct The precinct's attributes.
 * @returns {{ key: string, label: string, value: string }[]}
 */
export function districtRows(precinct) {
  if (!precinct) return [];
  return election.districtFields.flatMap(({ key, field }) => {
    const raw = precinct[field];
    if (typeof raw !== 'string' || !raw.trim()) return [];
    const value = (RULES[key] ?? String)(raw.trim())?.trim();
    return value ? [{ key, label: copy.districts.labels[key], value }] : [];
  });
}
