// The web app manifest's link (#25) is added well after the page has loaded,
// so its request (and the icon the browser then fetches) never competes with
// a page's data or its first paint.
import { linkManifest, MANIFEST_DELAY_MS, MANIFEST_HREF } from './linkManifest.js';

const manifestLinks = () => document.head.querySelectorAll('link[rel="manifest"]');

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  for (const link of manifestLinks()) link.remove();
  vi.useRealTimers();
});

function fakeWindow({ complete }) {
  const listeners = {};
  const idle = [];
  return {
    win: {
      document: { readyState: complete ? 'complete' : 'loading' },
      addEventListener: vi.fn((type, fn) => {
        listeners[type] = fn;
      }),
      requestIdleCallback: vi.fn((fn) => idle.push(fn)),
    },
    fire: (type) => listeners[type]?.(),
    runIdle: () => idle.splice(0).forEach((fn) => fn()),
  };
}

describe('linkManifest', () => {
  it('waits for the load event, the delay and idle time before linking the manifest', () => {
    const { win, fire, runIdle } = fakeWindow({ complete: false });
    linkManifest(document, win);
    vi.advanceTimersByTime(MANIFEST_DELAY_MS * 2);
    runIdle();
    expect(manifestLinks()).toHaveLength(0);

    fire('load');
    vi.advanceTimersByTime(MANIFEST_DELAY_MS - 1);
    runIdle();
    expect(manifestLinks()).toHaveLength(0);

    vi.advanceTimersByTime(1);
    expect(manifestLinks()).toHaveLength(0);
    runIdle();
    expect([...manifestLinks()].map((l) => l.getAttribute('href'))).toEqual([MANIFEST_HREF]);
  });

  // Long after any page's data has arrived on a slow phone connection.
  it('waits at least 10 seconds after load', () => {
    expect(MANIFEST_DELAY_MS).toBeGreaterThanOrEqual(10_000);
  });

  it('starts the delay at once when the page has already loaded', () => {
    const { win, runIdle } = fakeWindow({ complete: true });
    linkManifest(document, win);
    expect(win.addEventListener).not.toHaveBeenCalled();
    vi.advanceTimersByTime(MANIFEST_DELAY_MS);
    runIdle();
    expect(manifestLinks()).toHaveLength(1);
  });

  it('skips the idle wait where there is no idle callback', () => {
    const { win } = fakeWindow({ complete: true });
    delete win.requestIdleCallback;
    linkManifest(document, win);
    vi.advanceTimersByTime(MANIFEST_DELAY_MS);
    expect(manifestLinks()).toHaveLength(1);
  });

  it('never adds a second link', () => {
    const { win, runIdle } = fakeWindow({ complete: true });
    linkManifest(document, win);
    linkManifest(document, win);
    vi.advanceTimersByTime(MANIFEST_DELAY_MS);
    runIdle();
    expect(manifestLinks()).toHaveLength(1);
  });

  it('points at the manifest in public/', () => {
    expect(MANIFEST_HREF).toBe('/manifest.webmanifest');
  });
});
