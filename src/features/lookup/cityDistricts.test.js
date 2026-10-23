// The City districts card's rows (#90), from the City districts layer's answer
// as the City client returns it.
import districtsAtPoint from '../../../docs/raw/fixtures/city-districts-at-point.json';
import cityResults from '../../config/cityResults.js';
import election from '../../config/election.js';
import { cityDistrictRows } from './cityDistricts.js';
import { copy } from './resultsCopy.js';

// The fixture in the client's shape (src/data/cityArcgis.js).
const fields = election.jurisdictions.city.districtLayerFields;
const fixture = districtsAtPoint.features.map(({ attributes }) => ({
  office: attributes[fields.office],
  name: attributes[fields.name],
  id: attributes[fields.id],
}));

const row = (office, name) => ({ office, name, id: name });

describe('cityDistrictRows', () => {
  it('lists the six rows in the config order, with the layer text and copy labels', () => {
    expect(cityDistrictRows(fixture)).toEqual([
      {
        key: 'congressional',
        label: copy.districts.labels.congressional,
        values: ['First District'],
      },
      {
        key: 'stateSenate',
        label: copy.districts.labels.stateSenate,
        values: ['Missouri Senate District 5'],
      },
      {
        key: 'stateHouse',
        label: copy.districts.labels.stateHouse,
        values: ['Missouri House District 78'],
      },
      { key: 'cityWard', label: copy.districts.labels.cityWard, values: ['Ward 14'] },
      {
        key: 'juniorCollege',
        label: copy.districts.labels.juniorCollege,
        values: ['Community College Trustee Subdistrict 2'],
      },
      {
        key: 'school',
        label: copy.districts.labels.school,
        values: ['Board of Education for the City of St. Louis'],
      },
    ]);
  });

  it('takes its order and offices from the config', () => {
    expect(cityDistrictRows(fixture).map((r) => r.key)).toEqual(
      cityResults.districts.rows.map((r) => r.key),
    );
  });

  it('labels the ward in plain words', () => {
    expect(copy.districts.labels.cityWard).toBe('Ward');
  });

  it('leaves out citywide, statewide and placeholder offices', () => {
    const values = cityDistrictRows(fixture).flatMap((r) => r.values);
    expect(values).not.toContain('City of St. Louis');
    expect(values).not.toContain('State of Missouri');
    const rows = cityDistrictRows([
      row('President of the United States', 'President of the United States'),
      row('Mayor', 'City of St. Louis'),
    ]);
    expect(rows).toEqual([]);
  });

  it('reads both ward offices, Alderman and Alderwoman', () => {
    expect(cityDistrictRows([row('Alderwoman', 'Ward 3')])).toEqual([
      { key: 'cityWard', label: copy.districts.labels.cityWard, values: ['Ward 3'] },
    ]);
  });

  it('never shows a party committee row, whatever its district', () => {
    for (const office of ['Committeeman (R)', 'Committeewoman (D)', 'Committeeman (L)']) {
      expect(cityDistrictRows([row(office, 'Ward 14')])).toEqual([]);
    }
  });

  it('drops a value that names a party', () => {
    expect(cityDistrictRows([row('Alderman', 'Ward 14 (D)')])).toEqual([]);
    expect(cityDistrictRows([row('Alderman', 'Republican Ward 14')])).toEqual([]);
    expect(cityDistrictRows([row('Alderman', 'Ward 14 Democrats')])).toEqual([]);
    expect(
      cityDistrictRows([row('State Senate', 'Missouri Senate District 5 Democratic')]),
    ).toEqual([]);
  });

  it('lists two different values for one row, and one for repeats', () => {
    const rows = cityDistrictRows([
      row('State House Representative', 'Missouri House District 78'),
      row('State House Representative', 'Missouri House District 79'),
      row('Alderman', 'Ward 14'),
      row('Alderwoman', 'Ward 14'),
    ]);
    expect(rows).toEqual([
      {
        key: 'stateHouse',
        label: copy.districts.labels.stateHouse,
        values: ['Missouri House District 78', 'Missouri House District 79'],
      },
      { key: 'cityWard', label: copy.districts.labels.cityWard, values: ['Ward 14'] },
    ]);
  });

  it('trims values and skips empty ones', () => {
    expect(
      cityDistrictRows([
        row('Alderman', '  Ward 2 '),
        row('State Senate', ' '),
        row('State Senate', null),
      ]),
    ).toEqual([{ key: 'cityWard', label: copy.districts.labels.cityWard, values: ['Ward 2'] }]);
  });

  it('answers no rows for missing data', () => {
    expect(cityDistrictRows([])).toEqual([]);
    expect(cityDistrictRows(null)).toEqual([]);
    expect(cityDistrictRows(undefined)).toEqual([]);
  });
});
