import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import geocoder, { GeocoderUnavailableError } from './geocoder.js';
import { createFakeGeocoder } from '../test/fakeGeocoder.js';

const SRC = path.resolve(import.meta.dirname, '..');

describe('the unconfigured geocoder', () => {
  it('suggests nothing', async () => {
    await expect(geocoder.suggest('7700 Fine Rd')).resolves.toEqual([]);
  });

  it('rejects a geocode with GeocoderUnavailableError', async () => {
    const error = await geocoder.geocode('7700 Fine Rd').catch((e) => e);
    expect(error).toBeInstanceOf(GeocoderUnavailableError);
    expect(error.message).not.toContain('7700');
  });
});

describe('the app source', () => {
  it('names no geocoder provider and holds no API key', async () => {
    const entries = await readdir(SRC, { withFileTypes: true, recursive: true });
    const files = entries
      .filter((e) => e.isFile() && /\.(js|jsx)$/.test(e.name) && !/\.test\.jsx?$/.test(e.name))
      .map((e) => path.join(e.parentPath, e.name));
    const offenders = [];
    for (const file of files) {
      const text = await readFile(file, 'utf8');
      if (
        /geocode\.arcgis\.com|geocoding\.geo\.census\.gov|photon|nominatim|api[_-]?key|token=/i.test(
          text,
        )
      ) {
        offenders.push(path.relative(SRC, file));
      }
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
