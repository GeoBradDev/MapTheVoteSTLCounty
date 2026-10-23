// Fixtures are live responses recorded by scripts/record-fixtures.mjs. The
// expected values are what each precinct's own fields say, after the display
// rules; field names come from the election config.
import cc007 from '../../../docs/raw/fixtures/precinct-by-id.json';
import mer013 from '../../../docs/raw/fixtures/precinct-by-id-mer013.json';
import nw005 from '../../../docs/raw/fixtures/precinct-by-id-nw005.json';
import election from '../../config/election.js';
import { districtRows } from './districts.js';
import { copy } from './resultsCopy.js';

const attributesOf = (fixture) => fixture.features[0].attributes;
const fieldOf = (key) => election.districtFields.find((f) => f.key === key).field;
const shown = (precinct) => districtRows(precinct).map(({ key, value }) => [key, value]);

// A precinct with only these district fields set, by row key.
function precinctWith(values) {
  return Object.fromEntries(Object.entries(values).map(([key, v]) => [fieldOf(key), v]));
}

describe('districtRows', () => {
  // CC007 is in District 1 on the 2022 map, which applies on November 3, 2026
  // (#150), and District 2 on the 2025 map, which does not.
  it('lists an unincorporated precinct with no ward (CC007)', () => {
    expect(shown(attributesOf(cc007))).toEqual([
      ['congressional', 'US Representative District 1'],
      ['stateSenate', 'State Senate District 24'],
      ['stateHouse', 'State House District 71'],
      ['countyCouncil', 'County Council District 2'],
      ['municipality', copy.unincorporated],
      ['township', 'Creve Coeur Township'],
      ['school', 'Parkway School District'],
      ['juniorCollege', 'St. Louis Community College Subdistrict #4'],
      ['fire', 'Creve Coeur Fire Protection District'],
      ['library', 'St. Louis County Library'],
      ['sewer', 'Metropolitan St. Louis Sewer District'],
    ]);
  });

  it('lists a precinct with a ward and no sewer district (MER013)', () => {
    expect(shown(attributesOf(mer013))).toEqual([
      ['congressional', 'US Representative District 2'],
      ['stateSenate', 'State Senate District 26'],
      ['stateHouse', 'State House District 88'],
      ['countyCouncil', 'County Council District 7'],
      ['municipality', 'City of Eureka'],
      ['ward', 'City of Eureka Ward 2'],
      ['township', 'Meramec Township'],
      ['school', 'Rockwood R-VI School District'],
      ['juniorCollege', 'St. Louis Community College Subdistrict #4'],
      ['fire', 'Eureka Fire Protection District'],
      ['library', 'St. Louis County Library'],
    ]);
  });

  it('lists special districts, and the school without its cumulative voting prefix (NW005)', () => {
    expect(shown(attributesOf(nw005))).toEqual([
      ['congressional', 'US Representative District 1'],
      ['stateSenate', 'State Senate District 14'],
      ['stateHouse', 'State House District 70'],
      ['countyCouncil', 'County Council District 2'],
      ['municipality', 'City of Hazelwood'],
      ['ward', 'City of Hazelwood Ward 4'],
      ['township', 'Northwest Township'],
      ['school', 'Ferguson-Florissant R-2 School District'],
      ['juniorCollege', 'St. Louis Community College Subdistrict #1'],
      ['fire', 'Robertson Fire Protection District'],
      ['library', 'St. Louis County Library'],
      ['sewer', 'Metropolitan St. Louis Sewer District'],
      ['neighborhoodImprovement', 'Hazelwood Annexation Area NID'],
      ['annexation', 'Robertson Fire Annexation'],
    ]);
  });

  it('labels each row from the results copy', () => {
    const rows = districtRows(attributesOf(nw005));
    for (const { key, label } of rows) expect(label).toBe(copy.districts.labels[key]);
  });

  it('has a label for every configured field', () => {
    const missing = election.districtFields.filter(({ key }) => !copy.districts.labels[key]);
    expect(missing).toEqual([]);
  });

  it('never shows the 2025 congressional map or the pre-joined districts field (#150)', () => {
    const precinct = {
      ...attributesOf(cc007),
      congressional_district_25: 'NOT IN EFFECT',
      districts: 'PRE-JOINED',
    };
    const values = districtRows(precinct).map((row) => row.value);
    expect(values.join('\n')).not.toMatch(/NOT IN EFFECT|PRE-JOINED|2025/);
  });

  it('shows nothing from fields it does not list', () => {
    const precinct = { ...attributesOf(cc007), active: '1056', in_election: 'In Election' };
    const values = districtRows(precinct).map((row) => row.value);
    expect(values).not.toContain('1056');
    expect(values).not.toContain('In Election');
  });

  it.each([
    ['US Representative District 3 (2025)', 'US Representative District 3'],
    ['US Representative District 3', 'US Representative District 3'],
    ['  US Representative District 1 (2022)  ', 'US Representative District 1'],
  ])('shows the congressional district %j as %j', (value, expected) => {
    expect(shown(precinctWith({ congressional: value }))).toEqual([['congressional', expected]]);
  });

  it.each([null, undefined, '', '   ', 7, {}, ['x']])('hides an empty or odd value %j', (value) => {
    expect(districtRows(precinctWith({ fire: value, ward: value, road: value }))).toEqual([]);
  });

  it.each(['Unincorporated', 'unincorporated', ' UNINCORPORATED '])(
    'shows the municipality %j as unincorporated St. Louis County',
    (value) => {
      expect(shown(precinctWith({ municipality: value }))).toEqual([
        ['municipality', copy.unincorporated],
      ]);
    },
  );

  it.each(['No Sewer District', 'no sewer district', ' No Sewer District '])(
    'hides the sewer value %j',
    (value) => {
      expect(districtRows(precinctWith({ sewer: value }))).toEqual([]);
    },
  );

  it.each([
    [
      'CUMULATIVE VOTING - Ferguson-Florissant R-2 School District',
      'Ferguson-Florissant R-2 School District',
    ],
    ['cumulative voting -  Some School District', 'Some School District'],
    ['Parkway School District', 'Parkway School District'],
  ])('shows the school %j as %j', (value, expected) => {
    expect(shown(precinctWith({ school: value }))).toEqual([['school', expected]]);
  });

  it('hides a school that is only the cumulative voting prefix', () => {
    expect(districtRows(precinctWith({ school: 'CUMULATIVE VOTING - ' }))).toEqual([]);
  });

  it('applies each rule to its own field only', () => {
    expect(
      shown(
        precinctWith({ ward: 'No Sewer District', township: 'Unincorporated', fire: 'X (2025)' }),
      ),
    ).toEqual([
      ['ward', 'No Sewer District'],
      ['township', 'Unincorporated'],
      ['fire', 'X (2025)'],
    ]);
  });

  it('returns no rows for a missing precinct', () => {
    expect(districtRows(null)).toEqual([]);
    expect(districtRows(undefined)).toEqual([]);
  });
});
