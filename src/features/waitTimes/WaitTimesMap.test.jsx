// The wait times page's map (#104): extra help only, open on arrival but
// loaded once in view (#172), with a legend that names the unit and the
// current classes and hides when no site has a count.
import { act, render, screen, waitFor, within } from '@testing-library/react';
import { copy as resultsCopy } from '../lookup/resultsCopy.js';
import WaitTimesMap from './WaitTimesMap.jsx';
import { createWaitTimesMap } from './waitTimesMapView.js';
import { copy } from './waitTimesCopy.js';

vi.mock('./waitTimesMapView.js', () => ({ createWaitTimesMap: vi.fn() }));

const SITES = [
  { lat: 38.73, lng: -90.4, bin: 0 },
  { lat: 38.6, lng: -90.3, bin: null },
  { lat: 38.5, lng: -90.5, bin: 4 },
];
const CLASSES = [
  { min: 0, max: 3 },
  { min: 4, max: 9 },
  { min: 10, max: 10 },
];
let view;

beforeEach(() => {
  view = { setSites: vi.fn(), remove: vi.fn() };
  createWaitTimesMap.mockReset().mockReturnValue(view);
});

const region = () => screen.getByRole('region', { name: copy.map.label });

describe('WaitTimesMap', () => {
  it('draws every site, numbered in list order', async () => {
    render(<WaitTimesMap sites={SITES} classes={CLASSES} />);
    await waitFor(() => expect(createWaitTimesMap).toHaveBeenCalledTimes(1));
    const [container, { sites }] = createWaitTimesMap.mock.calls[0];
    expect(region()).toContainElement(container);
    expect(sites).toEqual(SITES);
    expect(region()).toHaveTextContent(copy.map.numbers);
  });

  it('passes a new order to the drawn map', async () => {
    const { rerender } = render(<WaitTimesMap sites={SITES} classes={CLASSES} />);
    await waitFor(() => expect(createWaitTimesMap).toHaveBeenCalled());
    const next = [...SITES].reverse();
    rerender(<WaitTimesMap sites={next} classes={CLASSES} />);
    expect(view.setSites).toHaveBeenLastCalledWith(next);
  });

  it('shows a legend naming the unit and each current class when a site has a count', () => {
    render(<WaitTimesMap sites={SITES} classes={CLASSES} />);
    const legend = within(region()).getByRole('list', { name: copy.map.legend });
    const items = within(legend).getAllByRole('listitem');
    expect(items.map((item) => item.textContent)).toEqual([
      '0 to 3 people',
      '4 to 9 people',
      '10 people',
      copy.map.noCount,
    ]);
  });

  it('names one person in a one value class', () => {
    render(<WaitTimesMap sites={SITES} classes={[{ min: 1, max: 1 }]} />);
    expect(within(region()).getByRole('list', { name: copy.map.legend })).toHaveTextContent(
      '1 person',
    );
  });

  it('hides the legend when no site has a count', () => {
    render(<WaitTimesMap sites={SITES.map((s) => ({ ...s, bin: null }))} classes={[]} />);
    expect(within(region()).queryByRole('list', { name: copy.map.legend })).toBeNull();
    expect(region()).not.toHaveTextContent(copy.map.legend);
  });

  it('credits the basemap', () => {
    render(<WaitTimesMap sites={SITES} classes={CLASSES} />);
    for (const { label, href } of resultsCopy.map.credits) {
      expect(within(region()).getByRole('link', { name: label })).toHaveAttribute('href', href);
    }
  });

  it('goes away when the map fails', async () => {
    render(<WaitTimesMap sites={SITES} classes={CLASSES} />);
    await waitFor(() => expect(createWaitTimesMap).toHaveBeenCalled());
    const { onFail } = createWaitTimesMap.mock.calls[0][1];
    act(() => onFail(new Error('no tiles')));
    expect(screen.queryByRole('region', { name: copy.map.label })).toBeNull();
  });

  it('frees the map when it goes', async () => {
    const { unmount } = render(<WaitTimesMap sites={SITES} classes={CLASSES} />);
    await waitFor(() => expect(createWaitTimesMap).toHaveBeenCalled());
    unmount();
    expect(view.remove).toHaveBeenCalled();
  });

  // Open on arrival, but MapLibre loads only once the map scrolls into view.
  describe('waiting until it is in view', () => {
    let observers;

    beforeEach(() => {
      observers = [];
      vi.stubGlobal(
        'IntersectionObserver',
        class {
          constructor(callback) {
            this.callback = callback;
            this.observe = vi.fn();
            this.disconnect = vi.fn();
            observers.push(this);
          }
        },
      );
    });

    afterEach(() => vi.unstubAllGlobals());

    it('reserves its box and loads nothing until it is in view', async () => {
      render(<WaitTimesMap sites={SITES} classes={CLASSES} />);
      expect(region()).toBeInTheDocument();
      expect(observers).toHaveLength(1);
      expect(observers[0].observe).toHaveBeenCalledWith(region());
      await Promise.resolve();
      expect(createWaitTimesMap).not.toHaveBeenCalled();

      act(() => observers[0].callback([{ isIntersecting: true }]));
      await waitFor(() => expect(createWaitTimesMap).toHaveBeenCalledTimes(1));
      expect(observers[0].disconnect).toHaveBeenCalled();
    });
  });

  // Opened on arrival (#172), the map may start loading in a tab the voter
  // then leaves: a hidden tab draws nothing, so its time does not count.
  describe('load time limit', () => {
    const LIMIT = 15_000;
    let visibility;

    beforeEach(() => {
      visibility = 'visible';
      vi.spyOn(document, 'visibilityState', 'get').mockImplementation(() => visibility);
    });

    afterEach(() => {
      vi.useRealTimers();
      vi.restoreAllMocks();
    });

    const setVisibility = (value) => {
      visibility = value;
      act(() => document.dispatchEvent(new Event('visibilitychange')));
    };

    it('drops a map that has not rendered in time', async () => {
      vi.useFakeTimers();
      render(<WaitTimesMap sites={SITES} classes={CLASSES} />);
      await act(() => vi.advanceTimersByTimeAsync(0));
      act(() => vi.advanceTimersByTime(LIMIT - 1));
      expect(region()).toBeInTheDocument();
      act(() => vi.advanceTimersByTime(1));
      expect(screen.queryByRole('region')).toBeNull();
    });

    it('does not count time while the page is hidden', async () => {
      vi.useFakeTimers();
      render(<WaitTimesMap sites={SITES} classes={CLASSES} />);
      await act(() => vi.advanceTimersByTimeAsync(0));
      act(() => vi.advanceTimersByTime(LIMIT - 1000));
      setVisibility('hidden');
      act(() => vi.advanceTimersByTime(LIMIT * 4));
      expect(region()).toBeInTheDocument();
      setVisibility('visible');
      act(() => vi.advanceTimersByTime(999));
      expect(region()).toBeInTheDocument();
      act(() => vi.advanceTimersByTime(1));
      expect(screen.queryByRole('region')).toBeNull();
    });

    it('starts the clock only when a page that opened hidden is shown', async () => {
      visibility = 'hidden';
      vi.useFakeTimers();
      render(<WaitTimesMap sites={SITES} classes={CLASSES} />);
      await act(() => vi.advanceTimersByTimeAsync(0));
      act(() => vi.advanceTimersByTime(LIMIT * 2));
      expect(region()).toBeInTheDocument();
      setVisibility('visible');
      act(() => vi.advanceTimersByTime(LIMIT));
      expect(screen.queryByRole('region')).toBeNull();
    });
  });
});
