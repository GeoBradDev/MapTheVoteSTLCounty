import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import geocoder, { attribution, GeocoderUnavailableError } from './geocoder.js';
import { GeocoderUnavailableError as ProviderError } from './geocoderError.js';
import { createFakeGeocoder } from '../test/fakeGeocoder.js';

const SRC = path.resolve(import.meta.dirname, '..');

describe('the app geocoder', () => {
  it('is one frozen Photon geocoder, the same object on every import', async () => {
    expect(Object.isFrozen(geocoder)).toBe(true);
    expect(geocoder.suggest).toEqual(expect.any(Function));
    expect(geocoder.geocode).toEqual(expect.any(Function));
    const again = await import('./geocoder.js');
    expect(again.default).toBe(geocoder);
  });

  it('re-exports the error the lookup checks for', () => {
    expect(GeocoderUnavailableError).toBe(ProviderError);
  });

  it('credits OpenStreetMap with its copyright page', () => {
    expect(attribution.dataUrl).toBe('https://www.openstreetmap.org/copyright');
    expect(attribution.data).toBe('OpenStreetMap contributors');
  });
});

describe('the app source', () => {
  // Only the module that picks the provider, and the provider itself, may name
  // one, so swapping it stays a change to those files.
  const PROVIDER_FILES = new Set(['data/geocoder.js', 'data/photon.js']);

  async function appFiles() {
    const entries = await readdir(SRC, { withFileTypes: true, recursive: true });
    return entries
      .filter((e) => e.isFile() && /\.(js|jsx)$/.test(e.name) && !/\.test\.jsx?$/.test(e.name))
      .map((e) => path.join(e.parentPath, e.name));
  }

  it('names a geocoder provider only in the provider modules', async () => {
    const offenders = [];
    for (const file of await appFiles()) {
      const relative = path.relative(SRC, file).split(path.sep).join('/');
      if (PROVIDER_FILES.has(relative)) continue;
      const text = await readFile(file, 'utf8');
      if (/geocode\.arcgis\.com|geocoding\.geo\.census\.gov|photon|komoot|nominatim/i.test(text)) {
        offenders.push(relative);
      }
    }
    expect(offenders).toEqual([]);
  });

  it('holds no API key or token anywhere', async () => {
    const offenders = [];
    for (const file of await appFiles()) {
      const text = await readFile(file, 'utf8');
      if (/api[_-]?key|token=|access_token/i.test(text)) offenders.push(path.relative(SRC, file));
    }
    expect(offenders).toEqual([]);
  });
});

describe('the test fake', () => {
  const fake = createFakeGeocoder([
    {
      label: '7700 Fine Rd, Saint Louis, MO 63129',
      lat: 38.5,
      lng: -90.3,
      state: 'MO',
      county: 'St. Louis County',
    },
    { label: '7701 Fine Rd, Saint Louis, MO 63129', lat: 38.51, lng: -90.31 },
  ]);

  it('suggests labels containing the text, case-insensitively', async () => {
    const suggestions = await fake.suggest('fine rd');
    expect(suggestions.map((s) => s.label)).toEqual([
      '7700 Fine Rd, Saint Louis, MO 63129',
      '7701 Fine Rd, Saint Louis, MO 63129',
    ]);
    expect(suggestions[0].id).toEqual(expect.any(String));
  });

  it('geocodes a suggestion or matching text, and null for no match', async () => {
    const [first] = await fake.suggest('7700');
    await expect(fake.geocode(first)).resolves.toEqual({
      lat: 38.5,
      lng: -90.3,
      state: 'MO',
      county: 'St. Louis County',
      label: '7700 Fine Rd, Saint Louis, MO 63129',
    });
    await expect(fake.geocode('7701 fine')).resolves.toMatchObject({ lat: 38.51 });
    await expect(fake.geocode('nowhere')).resolves.toBeNull();
  });

  it('records calls and rejects with AbortError once aborted', async () => {
    const controller = new AbortController();
    const pending = fake.suggest('fine', { signal: controller.signal });
    controller.abort();
    await expect(pending).rejects.toMatchObject({ name: 'AbortError' });
    expect(fake.calls.suggest).toContain('fine');
  });
});
