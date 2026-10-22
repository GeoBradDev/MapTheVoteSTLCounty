// The shared wait time loop (#103): one request per jurisdiction per interval
// however many components read it, paused in a hidden tab, and a failed
// refresh that keeps fresh values until they age out.
import { act, render, screen } from '@testing-library/react';
import { renderToString } from 'react-dom/server';
import election from '../../config/election.js';
import { createWaitTimesStore, useWaitTimes } from './useWaitTimes.js';

const MINUTE = 60_000;
const REFRESH = election.waitTimes.refreshSeconds * 1000;
// 9:00 a.m. Central on Thursday 2026-10-22.
const START = Date.UTC(2026, 9, 22, 14, 0);

let visibility;

function entry(jurisdiction, siteId, minutesAgo, value = 3) {
  return {
    siteId,
    jurisdiction,
    unit: 'people',
    value,
    reportedAt: new Date(Date.now() - minutesAgo * MINUTE),
    source: 'Board',
    openUntil: new Date(START + 8 * 60 * MINUTE),
  };
}

function setVisibility(next) {
  visibility = next;
  document.dispatchEvent(new Event('visibilitychange'));
}

// Lets the fetchers' promises settle.
const settle = () => act(async () => {});

function Reader({ name, store }) {
  const { waits, county, city } = useWaitTimes(store);
  return (
    <p data-testid={name}>
      {county.status}/{city.status}:{waits.map((w) => `${w.siteId}=${w.value}`).join(',')}
    </p>
  );
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(START);
  visibility = 'visible';
  vi.spyOn(document, 'visibilityState', 'get').mockImplementation(() => visibility);
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('useWaitTimes', () => {
  it('makes one request per jurisdiction per interval, however many components read it', async () => {
    const county = vi.fn(async () => [entry('county', 'abs601boec', 5)]);
    const city = vi.fn(async () => [entry('city', 'Board_Office', 5, 0)]);
    const store = createWaitTimesStore({ county, city });
    render(
      <>
        <Reader name="a" store={store} />
        <Reader name="b" store={store} />
        <Reader name="c" store={store} />
      </>,
    );
    await settle();
    expect(county).toHaveBeenCalledTimes(1);
    expect(city).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId('c')).toHaveTextContent('ok/ok:abs601boec=3,Board_Office=0');

    await act(() => vi.advanceTimersByTimeAsync(REFRESH));
    expect(county).toHaveBeenCalledTimes(2);
    expect(city).toHaveBeenCalledTimes(2);
    await act(() => vi.advanceTimersByTimeAsync(REFRESH * 3));
    expect(county).toHaveBeenCalledTimes(5);
    expect(city).toHaveBeenCalledTimes(5);
  });

  it('starts with loading, and never asks a second time while a request is in flight', async () => {
    let resolve;
    const county = vi.fn(() => new Promise((r) => (resolve = r)));
    const store = createWaitTimesStore({ county, city: null });
    render(<Reader name="a" store={store} />);
    expect(screen.getByTestId('a')).toHaveTextContent('loading/off:');
    await act(() => vi.advanceTimersByTimeAsync(REFRESH * 2));
    expect(county).toHaveBeenCalledTimes(1);
    await act(async () => resolve([entry('county', 'abs602boec', 1)]));
    expect(screen.getByTestId('a')).toHaveTextContent('ok/off:abs602boec=3');
  });

  it('stops in a hidden tab and refreshes at once on return', async () => {
    const county = vi.fn(async () => []);
    const store = createWaitTimesStore({ county, city: null });
    render(<Reader name="a" store={store} />);
    await settle();
    expect(county).toHaveBeenCalledTimes(1);

    act(() => setVisibility('hidden'));
    await act(() => vi.advanceTimersByTimeAsync(REFRESH * 10));
    expect(county).toHaveBeenCalledTimes(1);

    act(() => setVisibility('visible'));
    await settle();
    expect(county).toHaveBeenCalledTimes(2);
    await act(() => vi.advanceTimersByTimeAsync(REFRESH));
    expect(county).toHaveBeenCalledTimes(3);
  });

  it('does not start while the tab is hidden', async () => {
    visibility = 'hidden';
    const county = vi.fn(async () => []);
    const store = createWaitTimesStore({ county, city: null });
    render(<Reader name="a" store={store} />);
    await act(() => vi.advanceTimersByTimeAsync(REFRESH * 3));
    expect(county).not.toHaveBeenCalled();
    act(() => setVisibility('visible'));
    await settle();
    expect(county).toHaveBeenCalledTimes(1);
  });

  it('drops values that aged out while hidden as soon as the tab returns', async () => {
    let resolve;
    const county = vi
      .fn()
      .mockResolvedValueOnce([entry('county', 'abs601boec', 100)])
      .mockImplementation(() => new Promise((r) => (resolve = r)));
    const store = createWaitTimesStore({ county, city: null });
    render(<Reader name="a" store={store} />);
    await settle();
    expect(screen.getByTestId('a')).toHaveTextContent('abs601boec=3');

    act(() => setVisibility('hidden'));
    await act(() => vi.advanceTimersByTimeAsync(30 * MINUTE));
    act(() => setVisibility('visible'));
    // The new request is still in flight; the 130-minute-old count is gone.
    expect(screen.getByTestId('a')).toHaveTextContent('ok/off:');
    expect(screen.getByTestId('a')).not.toHaveTextContent('abs601boec');
    await act(async () => resolve([entry('county', 'abs601boec', 2, 7)]));
    expect(screen.getByTestId('a')).toHaveTextContent('abs601boec=7');
  });

  it('never shows values that aged out while no component read it, even for a frame', async () => {
    const county = vi
      .fn()
      .mockResolvedValueOnce([entry('county', 'abs601boec', 1)])
      .mockImplementation(() => new Promise(() => {}));
    const store = createWaitTimesStore({ county, city: null });
    const { unmount } = render(<Reader name="a" store={store} />);
    await settle();
    expect(screen.getByTestId('a')).toHaveTextContent('abs601boec=3');
    unmount();
    // The site closes at 5 p.m.; the voter comes back the next morning.
    vi.setSystemTime(START + 24 * 60 * MINUTE);
    const seen = [];
    function Spy() {
      seen.push(useWaitTimes(store).waits.length);
      return null;
    }
    render(<Spy />);
    expect(seen.length).toBeGreaterThan(0);
    expect(seen.every((n) => n === 0)).toBe(true);
  });

  it('keeps to one request per interval when readers come and go', async () => {
    const county = vi.fn(async () => []);
    const store = createWaitTimesStore({ county, city: null });
    const first = render(<Reader name="a" store={store} />);
    await settle();
    first.unmount();
    // A new page mounts its reader 10 s later: it waits out the interval.
    await act(() => vi.advanceTimersByTimeAsync(10_000));
    render(<Reader name="b" store={store} />);
    await settle();
    expect(county).toHaveBeenCalledTimes(1);
    await act(() => vi.advanceTimersByTimeAsync(REFRESH - 10_000));
    expect(county).toHaveBeenCalledTimes(2);
  });

  it('stops when no component reads it', async () => {
    const county = vi.fn(async () => []);
    const store = createWaitTimesStore({ county, city: null });
    const { unmount } = render(<Reader name="a" store={store} />);
    await settle();
    unmount();
    await act(() => vi.advanceTimersByTimeAsync(REFRESH * 5));
    expect(county).toHaveBeenCalledTimes(1);
    act(() => setVisibility('visible'));
    expect(county).toHaveBeenCalledTimes(1);
  });

  it('keeps the last values through a failed refresh until they age out, then is unavailable', async () => {
    const county = vi
      .fn()
      .mockResolvedValueOnce([entry('county', 'abs601boec', 110)])
      .mockRejectedValue(new Error('down'));
    const store = createWaitTimesStore({ county, city: null });
    render(<Reader name="a" store={store} />);
    await settle();
    await act(() => vi.advanceTimersByTimeAsync(REFRESH));
    expect(county).toHaveBeenCalledTimes(2);
    expect(screen.getByTestId('a')).toHaveTextContent('ok/off:abs601boec=3');
    expect(store.getSnapshot().county.refreshFailed).toBe(true);

    // The report turns 120 minutes old about 10 minutes in.
    await act(() => vi.advanceTimersByTimeAsync(10 * MINUTE));
    expect(screen.getByTestId('a')).toHaveTextContent('unavailable/off:');
  });

  it('drops a kept value once its site closes', async () => {
    const closing = { ...entry('county', 'abs601boec', 1), openUntil: new Date(START + MINUTE) };
    const county = vi.fn().mockResolvedValueOnce([closing]).mockRejectedValue(new Error('down'));
    const store = createWaitTimesStore({ county, city: null });
    render(<Reader name="a" store={store} />);
    await settle();
    expect(screen.getByTestId('a')).toHaveTextContent('abs601boec=3');
    await act(() => vi.advanceTimersByTimeAsync(REFRESH * 2));
    expect(screen.getByTestId('a')).toHaveTextContent('unavailable/off:');
  });

  it('is unavailable when the first request fails, and recovers on a later success', async () => {
    const county = vi
      .fn()
      .mockRejectedValueOnce(new Error('down'))
      .mockResolvedValue([entry('county', 'abs603boec', 1, 4)]);
    const store = createWaitTimesStore({ county, city: null });
    render(<Reader name="a" store={store} />);
    await settle();
    expect(screen.getByTestId('a')).toHaveTextContent('unavailable/off:');
    await act(() => vi.advanceTimersByTimeAsync(REFRESH));
    expect(screen.getByTestId('a')).toHaveTextContent('ok/off:abs603boec=4');
    expect(store.getSnapshot().county.refreshFailed).toBe(false);
  });

  it('keeps one jurisdiction when the other fails', async () => {
    const county = vi.fn(async () => [entry('county', 'abs601boec', 1)]);
    const city = vi.fn(async () => {
      throw new Error('down');
    });
    const store = createWaitTimesStore({ county, city });
    render(<Reader name="a" store={store} />);
    await settle();
    expect(screen.getByTestId('a')).toHaveTextContent('ok/unavailable:abs601boec=3');
  });

  it('asks nothing for a jurisdiction that is off', async () => {
    const store = createWaitTimesStore({ county: null, city: null });
    render(<Reader name="a" store={store} />);
    await act(() => vi.advanceTimersByTimeAsync(REFRESH * 2));
    expect(screen.getByTestId('a')).toHaveTextContent('off/off:');
  });

  it('renders the loading state on the server without asking', () => {
    const county = vi.fn(async () => []);
    const store = createWaitTimesStore({ county, city: null });
    const html = renderToString(<Reader name="a" store={store} />).replaceAll('<!-- -->', '');
    expect(html).toContain('loading/off:');
    expect(county).not.toHaveBeenCalled();
  });
});
