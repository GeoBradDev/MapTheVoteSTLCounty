// The maps follow the system color scheme (#77): Positron in light, the dark
// style in dark, switching when the setting changes.
import { BASEMAP_DARK_STYLE_URL, BASEMAP_STYLE_URL } from './basemap.js';
import { basemapStyleUrl, DARK_SCHEME, watchColorScheme } from './mapStyle.js';

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

afterEach(() => vi.unstubAllGlobals());

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

describe('the basemap styles', () => {
  it('both come from the one origin the Content-Security-Policy allows', () => {
    expect(new URL(BASEMAP_DARK_STYLE_URL).origin).toBe(new URL(BASEMAP_STYLE_URL).origin);
  });
});
