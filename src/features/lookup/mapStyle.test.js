// The maps follow the system color scheme (#77): Positron in light, the dark
// style in dark, switching when the setting changes.
import { BASEMAP_DARK_STYLE_URL, BASEMAP_STYLE_URL } from './basemap.js';
import { basemapStyleUrl, DARK_SCHEME, followColorScheme, watchColorScheme } from './mapStyle.js';
import { unmountThenUnstub } from '../../test/teardown.js';

function fakeMedia(matches) {
  const listeners = new Set();
  const query = {
    matches,
    addEventListener: vi.fn((type, fn) => type === 'change' && listeners.add(fn)),
    removeEventListener: vi.fn((type, fn) => type === 'change' && listeners.delete(fn)),
    flip() {
      query.matches = !query.matches;
      listeners.forEach((fn) => fn({ matches: query.matches }));
    },
    listeners,
  };
  vi.stubGlobal(
    'matchMedia',
    vi.fn((q) => (q === DARK_SCHEME ? query : { matches: false })),
  );
  return query;
}

afterEach(() => unmountThenUnstub());

describe('basemapStyleUrl', () => {
  it('is Positron in the light scheme', () => {
    fakeMedia(false);
    expect(basemapStyleUrl()).toBe(BASEMAP_STYLE_URL);
  });

  it('is the dark style in the dark scheme', () => {
    fakeMedia(true);
    expect(basemapStyleUrl()).toBe(BASEMAP_DARK_STYLE_URL);
  });

  it('is Positron where the browser cannot tell', () => {
    vi.stubGlobal('matchMedia', undefined);
    expect(basemapStyleUrl()).toBe(BASEMAP_STYLE_URL);
  });

  it('asks for the same query the stylesheet uses for its dark values', () => {
    expect(DARK_SCHEME).toBe('(prefers-color-scheme: dark)');
  });
});

describe('watchColorScheme', () => {
  it('calls back on each change until stopped', () => {
    const media = fakeMedia(false);
    const onChange = vi.fn();
    const stop = watchColorScheme(onChange);
    media.flip();
    expect(onChange).toHaveBeenCalledTimes(1);
    media.flip();
    expect(onChange).toHaveBeenCalledTimes(2);
    stop();
    expect(media.listeners.size).toBe(0);
    media.flip();
    expect(onChange).toHaveBeenCalledTimes(2);
  });

  it('does nothing where the browser cannot tell', () => {
    vi.stubGlobal('matchMedia', undefined);
    const stop = watchColorScheme(vi.fn());
    expect(() => stop()).not.toThrow();
  });
});

describe('followColorScheme', () => {
  const STYLE = { version: 8, sources: {}, layers: [] };
  const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

  it('fetches the new scheme style, then sets it', async () => {
    const media = fakeMedia(false);
    const fetchStub = vi.fn(async () => ({ ok: true, json: async () => STYLE }));
    vi.stubGlobal('fetch', fetchStub);
    const map = { setStyle: vi.fn() };
    followColorScheme(map);
    media.flip();
    await flush();
    expect(fetchStub).toHaveBeenCalledWith(BASEMAP_DARK_STYLE_URL, {
      credentials: 'omit',
      referrerPolicy: 'no-referrer',
    });
    expect(map.setStyle).toHaveBeenCalledWith(STYLE, { diff: false });
  });

  it.each([
    ['the request fails', async () => Promise.reject(new TypeError('offline'))],
    ['the answer is an error', async () => ({ ok: false, json: async () => ({}) })],
    ['the answer is not JSON', async () => ({ ok: true, json: () => Promise.reject(new Error()) })],
  ])('keeps the drawn basemap when %s', async (_, answer) => {
    const media = fakeMedia(false);
    vi.stubGlobal('fetch', vi.fn(answer));
    const map = { setStyle: vi.fn() };
    followColorScheme(map);
    media.flip();
    await flush();
    expect(map.setStyle).not.toHaveBeenCalled();
  });

  it('sets nothing once stopped, even for a style already on its way', async () => {
    const media = fakeMedia(false);
    let answer;
    vi.stubGlobal(
      'fetch',
      vi.fn(() => new Promise((resolve) => (answer = resolve))),
    );
    const map = { setStyle: vi.fn() };
    const stop = followColorScheme(map);
    media.flip();
    stop();
    answer({ ok: true, json: async () => STYLE });
    await flush();
    expect(map.setStyle).not.toHaveBeenCalled();
    expect(media.listeners.size).toBe(0);
  });

  it('sets only the style for the scheme now when it changes again mid-load', async () => {
    const media = fakeMedia(false);
    const answers = [];
    vi.stubGlobal(
      'fetch',
      vi.fn((url) => new Promise((resolve) => answers.push([url, resolve]))),
    );
    const map = { setStyle: vi.fn() };
    followColorScheme(map);
    media.flip();
    media.flip();
    const light = { ...STYLE, name: 'light' };
    answers[1][1]({ ok: true, json: async () => light });
    answers[0][1]({ ok: true, json: async () => ({ ...STYLE, name: 'dark' }) });
    await flush();
    expect(answers.map(([url]) => url)).toEqual([BASEMAP_DARK_STYLE_URL, BASEMAP_STYLE_URL]);
    expect(map.setStyle).toHaveBeenCalledTimes(1);
    expect(map.setStyle).toHaveBeenCalledWith(light, { diff: false });
  });
});

describe('the basemap styles', () => {
  it('both come from the one origin the Content-Security-Policy allows', () => {
    expect(new URL(BASEMAP_DARK_STYLE_URL).origin).toBe(new URL(BASEMAP_STYLE_URL).origin);
  });
});
