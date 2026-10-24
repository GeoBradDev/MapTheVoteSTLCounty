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
  serviceNames,
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

// A doc with the Service inventory heading and the given lines after it.
const inventoryDoc = (...lines) => ['## Service inventory', '', ...lines].join('\n');

describe('documentedServices', () => {
  it('reads each line of a services block into its root, with globs and spaces', () => {
    const doc = inventoryDoc(
      '```services county',
      '*_1999_*',
      'Hub Events (public)',
      '  survey123_abc_form  ',
      '```',
      '',
      '```services city',
      'City_Layer',
      '```',
    );
    const documented = documentedServices(doc);
    expect(
      undocumentedServices(
        [
          '11_5_1999_Polling_Places',
          'Hub Events (public)',
          'survey123_abc_form',
          'polls_2027_11_view',
        ],
        documented.county,
      ),
    ).toEqual(['polls_2027_11_view']);
    expect(undocumentedServices(['City_Layer', 'Hub Events (public)'], documented.city)).toEqual([
      'Hub Events (public)',
    ]);
  });

  it('keeps each root apart, so a name in one org does not hide the same name in another', () => {
    const doc = inventoryDoc('```services city', 'Parcels', '```');
    const documented = documentedServices(doc);
    expect(undocumentedServices(['Parcels'], documented.city)).toEqual([]);
    expect(undocumentedServices(['Parcels'], documented.county)).toEqual(['Parcels']);
  });

  it('ignores code spans and other fenced blocks: field names and prose are not services', () => {
    const doc = inventoryDoc(
      'The `precincts` field, `URL`, `Line_View/FeatureServer/0` and `party*`.',
      '```js',
      'not_a_service',
      '```',
    );
    const documented = documentedServices(doc);
    expect(
      undocumentedServices(
        ['precincts', 'URL', 'Line_View', 'Party_x', 'not_a_service'],
        documented.county,
      ),
    ).toEqual(['precincts', 'URL', 'Line_View', 'Party_x', 'not_a_service']);
  });

  it('ignores a services line that is too broad to mean anything', () => {
    const doc = inventoryDoc('```services county', '*', '*_a*', '```');
    expect(undocumentedServices(['anything', 'x_a_y'], documentedServices(doc).county)).toEqual([
      'anything',
      'x_a_y',
    ]);
  });

  it('reads only the Service inventory section', () => {
    const doc = [
      '## Layers',
      '```services county',
      'Before_Block',
      '```',
      '## Service inventory',
      '### Read by the app',
      '```services county',
      'Inventory_Block',
      '```',
      '## Next section',
      '```services county',
      'After_Block',
      '```',
    ].join('\n');
    expect(
      undocumentedServices(
        ['Before_Block', 'Inventory_Block', 'After_Block'],
        documentedServices(doc).county,
      ),
    ).toEqual(['Before_Block', 'After_Block']);
  });

  it('documents nothing for a root with no block, or with no Service inventory section', () => {
    expect(undocumentedServices(['A'], documentedServices(inventoryDoc()).boe)).toEqual(['A']);
    const noSection = '```services county\nA\n```\n';
    expect(undocumentedServices(['A'], documentedServices(noSection).county)).toEqual(['A']);
  });

  it('lists each undocumented name once, in order', () => {
    expect(undocumentedServices(['b', 'a', 'b'], documentedServices('').county)).toEqual([
      'b',
      'a',
    ]);
  });
});

describe('the inventory against docs/data.md', () => {
  const documented = documentedServices(readFileSync('docs/data.md', 'utf8'));

  it('lists the County org, the City org and the City Board folder on maps6', () => {
    expect(INVENTORY_ROOTS.map((r) => [r.key, r.url])).toEqual([
      ['county', election.serviceRoot],
      ['city', city.serviceRoot],
      ['boe', 'https://maps6.stlouis-mo.gov/arcgis/rest/services/BOE'],
    ]);
  });

  it('lists every layer the app reads under its own org', () => {
    const names = (paths) => [...new Set(paths.map((p) => p.split('/')[0]))];
    expect(undocumentedServices(names(Object.values(election.layers)), documented.county)).toEqual(
      [],
    );
    const cityPaths = [...Object.values(city.layers), election.waitTimes.city.layer];
    expect(undocumentedServices(names(cityPaths), documented.city)).toEqual([]);
  });

  it('still notices a new election service in either org', () => {
    const fresh = [
      'polls_2027_11_view',
      'polls_2027_04_view',
      'precincts_2027_04_view',
      'April_6_2027_Polling_Places_Dashboard_view',
      'VotingLocations_currentwait_0123456789abcdef0123456789abcdef',
      'survey123_0123456789abcdef0123456789abcdef_form',
      'service_0123456789abcdef0123456789abcdef_form',
      'BOE/PRECINCTS_2027',
    ];
    for (const key of ['county', 'city', 'boe']) {
      expect(undocumentedServices(fresh, documented[key])).toEqual(fresh);
    }
  });
});

describe('serviceNames', () => {
  it('reads the names from a services directory listing', () => {
    const listing = {
      services: [
        { name: 'A', type: 'FeatureServer' },
        { name: 'B', type: 'MapServer' },
      ],
    };
    expect(serviceNames(listing)).toEqual(['A', 'B']);
  });

  it('fails on an ArcGIS error body, which comes with HTTP 200', () => {
    expect(() => serviceNames({ error: { code: 499, message: 'Token Required' } })).toThrow(
      /Token Required/,
    );
    expect(() => serviceNames({ error: { code: 400, message: 'Invalid URL' } })).toThrow(
      /Invalid URL/,
    );
  });

  it('fails when the listing has no services list', () => {
    expect(() => serviceNames({ folders: [] })).toThrow(/no services list/);
  });
});
