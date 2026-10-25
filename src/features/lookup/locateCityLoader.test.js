// locate() with a City loader of its own, as scripts/check-geocoder.mjs passes
// under plain Node (#198): a loader that fails is the City layer failing.
// @vitest-environment node
import { locate } from './locate.js';
import { unmountThenUnstub } from '../../test/teardown.js';

// 1200 Market St, St. Louis, MO 63103 (City Hall), as the geocoder names it.
const CITY = { lat: 38.62741, lng: -90.19843, state: 'MO', county: 'St. Louis city' };

afterEach(async () => {
  await unmountThenUnstub();
});

describe('locate, when a City loader of its own fails (#198)', () => {
  it('gives a City place the City referral, as when the City chunk fails', async () => {
    // The county's precinct layer has no precinct at City Hall.
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ features: [] })));
    vi.stubGlobal('fetch', fetchMock);
    const loadCity = vi.fn(async () => {
      throw new Error('cannot load');
    });
    expect(await locate(CITY, { loadCity })).toEqual({ kind: 'stl-city' });
    expect(loadCity).toHaveBeenCalledTimes(1);
  });

  it('gives a City place the City referral when the loaded City code finds nothing', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(JSON.stringify({ features: [] }))),
    );
    const getCityPrecinctAtPoint = vi.fn(async () => null);
    expect(await locate(CITY, { loadCity: async () => ({ getCityPrecinctAtPoint }) })).toEqual({
      kind: 'stl-city',
    });
    expect(getCityPrecinctAtPoint).toHaveBeenCalledTimes(1);
  });
});
