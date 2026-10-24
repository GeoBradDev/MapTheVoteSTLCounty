// scripts/inspect-data.mjs's City requests (#95): the City Board's layers hold
// officeholder names and contacts (districts) and staff contacts (voting
// locations), so the inspection asks each only for the fields the app reads.
// The service inventory (#101): the script lists every service in the County
// and City service directories and prints the ones docs/data.md never mentions.
// @vitest-environment node
import { readFileSync } from 'node:fs';
import election from '../config/election.js';
import {
  cityLayerRequests,
  documentedServices,
  INVENTORY_ROOTS,
  undocumentedServices,
} from '../../scripts/inspect-data.mjs';

const city = election.jurisdictions.city;
const wait = election.waitTimes.city;

describe('cityLayerRequests', () => {
  const requests = cityLayerRequests(election);

  it('inspects each City layer path once, from the config', () => {
    expect(requests.map((r) => r.key)).toEqual(['precincts', 'districts', 'sites']);
    expect(requests.map((r) => r.url)).toEqual([
      `${city.serviceRoot}/${city.layers.precincts}`,
      `${city.serviceRoot}/${city.layers.districts}`,
      `${city.serviceRoot}/${city.layers.sites}`,
    ]);
    // The outline is a filter on the districts layer, not another layer.
    expect(city.layers.boundary).toBe(city.layers.districts);
  });

  it('never asks for every field', () => {
    for (const { outFields } of requests) {
      expect(outFields.split(',')).not.toContain('*');
      expect(outFields).not.toBe('');
    }
  });

  it('leaves the wait fields out when the wait layer moves', () => {
    const moved = {
      ...election,
      waitTimes: { ...election.waitTimes, city: { ...wait, layer: 'Other/FeatureServer/0' } },
    };
    const sites = cityLayerRequests(moved).find((r) => r.key === 'sites');
    expect(sites.outFields.split(',')).toEqual(Object.values(city.siteFields));
  });

  it('asks each layer for the fields the app reads, less free text', () => {
    const fields = Object.fromEntries(requests.map((r) => [r.key, r.outFields.split(',')]));
    expect(fields.precincts).toEqual([city.precinctField]);
    expect(fields.districts).toEqual(Object.values(city.districtLayerFields));
    expect(fields.sites).toEqual([
      ...Object.values(city.siteFields),
      wait.valueField,
      wait.timeField,
      wait.hoursField,
    ]);
    // The config's wait layer is the voting locations layer, so its fields are
    // sampled there.
    expect(`${wait.serviceRoot}/${wait.layer}`).toBe(`${city.serviceRoot}/${city.layers.sites}`);
    // Free text from the sites, which can name people: never sampled.
    expect(fields.sites).not.toContain(wait.commentsField);
  });
});

describe('documentedServices', () => {
  it('reads exact names from code spans: bare, layer paths and service URLs', () => {
    // Made-up names: the real ones live only in the election config.
    const doc = [
      'The `precincts_1999_01_view` layer, `polls_1999_01_view/FeatureServer/1`,',
      '`BOE/Some_Board_Layer/MapServer/2` and',
      '`https://example.org/ArcGIS/rest/services/Line_View/FeatureServer/0?f=json`,',
      'and `https://example.org/arcgis/rest/services/GEOCODERS/A_GEOCODE/GeocodeServer`.',
    ].join('\n');
    const documented = documentedServices(doc);
    const names = [
      'precincts_1999_01_view',
      'polls_1999_01_view',
      'BOE/Some_Board_Layer',
      'Line_View',
      'GEOCODERS/A_GEOCODE',
    ];
    expect(undocumentedServices(names, documented)).toEqual([]);
  });

  it('ignores prose, code spans with spaces and globs in code spans', () => {
    const doc = 'Precincts_Old are old. `status = 1` and `party*` and `Districts_*`.';
    const documented = documentedServices(doc);
    expect(
      undocumentedServices(
        ['Precincts_Old', 'status', 'Party_Ballot', 'party_x', 'Districts_1'],
        documented,
      ),
    ).toEqual(['Precincts_Old', 'status', 'Party_Ballot', 'party_x', 'Districts_1']);
  });

  it('reads each line of a services block, with globs and names with spaces', () => {
    const doc = [
      'Past elections:',
      '',
      '```services',
      '*_2024_*',
      'Hub Events (public)',
      '  survey123_abc_form  ',
      '```',
      '',
      '```js',
      'not_a_service',
      '```',
    ].join('\n');
    const documented = documentedServices(doc);
    expect(
      undocumentedServices(
        [
          '11_5_2024_Polling_Places',
          'precincts_2024_04_12_view',
          'Hub Events (public)',
          'survey123_abc_form',
          'polls_2027_11_view',
          'not_a_service',
        ],
        documented,
      ),
    ).toEqual(['polls_2027_11_view', 'not_a_service']);
  });

  it('ignores a services line that is too broad to mean anything', () => {
    const doc = '```services\n*\n*_a*\n```\n';
    expect(undocumentedServices(['anything', 'x_a_y'], documentedServices(doc))).toEqual([
      'anything',
      'x_a_y',
    ]);
  });

  it('lists each undocumented name once, in order', () => {
    expect(undocumentedServices(['b', 'a', 'b'], documentedServices(''))).toEqual(['b', 'a']);
  });
});

describe('the inventory against docs/data.md', () => {
  const documented = documentedServices(readFileSync('docs/data.md', 'utf8'));

  it('lists the County org, the City org and the City Board folder on maps6', () => {
    expect(INVENTORY_ROOTS.map((r) => r.url)).toEqual([
      election.serviceRoot,
      city.serviceRoot,
      'https://maps6.stlouis-mo.gov/arcgis/rest/services/BOE',
    ]);
  });

  it('mentions every layer the app reads', () => {
    const city = election.jurisdictions.city;
    const paths = [
      ...Object.values(election.layers),
      ...Object.values(city.layers),
      election.waitTimes.county.layer,
      election.waitTimes.city.layer,
    ];
    const names = [...new Set(paths.map((p) => p.split('/')[0]))];
    expect(undocumentedServices(names, documented)).toEqual([]);
  });

  it('still notices a new election service in either org', () => {
    const fresh = [
      'polls_2027_04_view',
      'precincts_2027_04_view',
      'April_6_2027_Polling_Places_Dashboard_view',
      'VotingLocations_currentwait_0123456789abcdef0123456789abcdef',
      'survey123_0123456789abcdef0123456789abcdef_form',
      'service_0123456789abcdef0123456789abcdef_form',
      'BOE/PRECINCTS_2027',
    ];
    expect(undocumentedServices(fresh, documented)).toEqual(fresh);
  });
});
