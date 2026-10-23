// scripts/inspect-data.mjs's City requests (#95): the City Board's layers hold
// officeholder names and contacts (districts) and staff contacts (voting
// locations), so the inspection asks each only for the fields the app reads.
// @vitest-environment node
import election from '../config/election.js';
import { cityLayerRequests } from '../../scripts/inspect-data.mjs';

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

  it('asks each layer for exactly the fields the app reads', () => {
    const fields = Object.fromEntries(requests.map((r) => [r.key, r.outFields.split(',')]));
    expect(fields.precincts).toEqual([city.precinctField]);
    expect(fields.districts).toEqual(Object.values(city.districtLayerFields));
    expect(fields.sites).toEqual([
      ...Object.values(city.siteFields),
      wait.valueField,
      wait.timeField,
      wait.hoursField,
    ]);
    // Free text from the sites, which can name people: never sampled.
    expect(fields.sites).not.toContain(wait.commentsField);
  });
});
