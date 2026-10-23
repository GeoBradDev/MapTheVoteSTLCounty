import { act, render, screen, waitFor, within } from '@testing-library/react';
import geometry from '../../../docs/raw/fixtures/precinct-geometry.json';
import election from '../../config/election.js';
import { getPrecinctGeometry } from '../../data/arcgis.js';
import referrals from '../../config/referrals.js';
import { city } from '../../data/jurisdictions.js';
import { BASEMAP_ATTRIBUTION } from './basemap.js';
import { JurisdictionContext } from './jurisdictionContext.js';
import PrecinctMap from './PrecinctMap.jsx';
import { createPrecinctMap } from './precinctMapView.js';
import { copy } from './resultsCopy.js';

vi.mock('../../data/arcgis.js', () => ({ getPrecinctGeometry: vi.fn() }));
vi.mock('./precinctMapView.js', () => ({ createPrecinctMap: vi.fn() }));

const ORIGIN = { lat: 38.66, lng: -90.45 };
const POLLS = [
  { lat: 38.65, lng: -90.44 },
  { lat: 38.67, lng: -90.46 },
];
const feature = geometry.features[0];

let view;

beforeEach(() => {
  vi.stubGlobal('WebGL2RenderingContext', function WebGL2RenderingContext() {});
  getPrecinctGeometry.mockReset().mockResolvedValue(feature);
  view = { setPolls: vi.fn(), remove: vi.fn() };
  createPrecinctMap.mockReset().mockReturnValue(view);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

const region = () => screen.getByRole('region', { name: copy.map.label('CC007') });
const options = () => createPrecinctMap.mock.calls[0][1];

describe('PrecinctMap', () => {
  it('draws the outline, the looked-up point and the polling places', async () => {
    render(<PrecinctMap code="CC007" origin={ORIGIN} polls={POLLS} />);
    await waitFor(() => expect(createPrecinctMap).toHaveBeenCalledTimes(1));
    const [container, { geometry: drawn, origin, polls }] = createPrecinctMap.mock.calls[0];
    expect(region()).toContainElement(container);
    expect(getPrecinctGeometry).toHaveBeenCalledWith('CC007');
    expect(drawn).toEqual(feature.geometry);
    expect(origin).toEqual(ORIGIN);
    expect(polls).toEqual(POLLS);
  });

  // precinctMap.css sets position: relative on .maplibregl-map, which beats a
  // Tailwind position utility on the same element and collapsed the map to 0 px.
  it('gives the map element a size without a position utility', async () => {
    render(<PrecinctMap code="CC007" origin={ORIGIN} polls={POLLS} />);
    await waitFor(() => expect(createPrecinctMap).toHaveBeenCalled());
    const [container] = createPrecinctMap.mock.calls[0];
    expect(container).toHaveClass('h-full', 'w-full');
    expect(container.className).not.toMatch(/\b(absolute|relative|fixed|sticky|inset-\S+)\b/);
  });

  it('explains the map in text, including the dot only when there is a looked-up point', () => {
    const { unmount } = render(<PrecinctMap code="CC007" origin={ORIGIN} polls={POLLS} />);
    expect(region()).toHaveTextContent(copy.map.legend('CC007'));
    expect(region()).toHaveTextContent(copy.map.origin);
    unmount();
    render(<PrecinctMap code="CC007" origin={null} polls={POLLS} />);
    expect(region()).toHaveTextContent(copy.map.legend('CC007'));
    expect(region()).not.toHaveTextContent(copy.map.origin);
  });

  it('credits the basemap and the county data with links', () => {
    render(<PrecinctMap code="CC007" origin={ORIGIN} polls={POLLS} />);
    for (const { label, href } of BASEMAP_ATTRIBUTION) {
      expect(within(region()).getByRole('link', { name: label })).toHaveAttribute('href', href);
    }
    expect(within(region()).getByRole('link', { name: copy.map.county })).toHaveAttribute(
      'href',
      election.countySiteUrl,
    );
  });

  // #89: a City precinct's map draws the City outline and credits the City Board.
  it('draws a City outline and credits the City Board on a City page', async () => {
    const outline = { type: 'Feature', geometry: feature.geometry };
    const cityAdapter = { ...city, getOutline: vi.fn().mockResolvedValue(outline) };
    render(
      <JurisdictionContext value={cityAdapter}>
        <PrecinctMap code="W01P12" origin={null} polls={POLLS} />
      </JurisdictionContext>,
    );
    await waitFor(() => expect(createPrecinctMap).toHaveBeenCalledTimes(1));
    expect(cityAdapter.getOutline).toHaveBeenCalledWith('W01P12');
    expect(getPrecinctGeometry).not.toHaveBeenCalled();
    const map = screen.getByRole('region', { name: copy.map.label('W01P12') });
    expect(within(map).getByRole('link', { name: copy.map.city })).toHaveAttribute(
      'href',
      referrals.stlCityBoard.url,
    );
    expect(within(map).queryByRole('link', { name: copy.map.county })).toBeNull();
  });

  it('shows a placeholder until the map has rendered', async () => {
    render(<PrecinctMap code="CC007" origin={ORIGIN} polls={POLLS} />);
    expect(screen.getByTestId('map-placeholder')).toBeInTheDocument();
    await waitFor(() => expect(createPrecinctMap).toHaveBeenCalled());
    options().onReady();
    await waitFor(() => expect(screen.queryByTestId('map-placeholder')).toBeNull());
    expect(region()).toBeInTheDocument();
  });

  it('removes itself when the map fails to load', async () => {
    render(<PrecinctMap code="CC007" origin={ORIGIN} polls={POLLS} />);
    await waitFor(() => expect(createPrecinctMap).toHaveBeenCalled());
    options().onFail(new Error('tiles'));
    await waitFor(() => expect(screen.queryByRole('region')).toBeNull());
  });

  it('removes itself when the map cannot be created, as without WebGL', async () => {
    createPrecinctMap.mockImplementation(() => {
      throw new Error('Failed to initialize WebGL');
    });
    render(<PrecinctMap code="CC007" origin={ORIGIN} polls={POLLS} />);
    await waitFor(() => expect(screen.queryByRole('region')).toBeNull());
  });

  it('removes itself when the outline fails to load', async () => {
    getPrecinctGeometry.mockRejectedValue(new Error('down'));
    render(<PrecinctMap code="CC007" origin={ORIGIN} polls={POLLS} />);
    await waitFor(() => expect(screen.queryByRole('region')).toBeNull());
    expect(createPrecinctMap).not.toHaveBeenCalled();
  });

  it('renders nothing and loads nothing in a browser without WebGL 2', () => {
    vi.stubGlobal('WebGL2RenderingContext', undefined);
    const { container } = render(<PrecinctMap code="CC007" origin={ORIGIN} polls={POLLS} />);
    expect(container).toBeEmptyDOMElement();
    expect(getPrecinctGeometry).not.toHaveBeenCalled();
  });

  it('passes new polling places to the map, as after "Show more"', async () => {
    const { rerender } = render(<PrecinctMap code="CC007" origin={ORIGIN} polls={POLLS} />);
    await waitFor(() => expect(createPrecinctMap).toHaveBeenCalled());
    const more = [...POLLS, { lat: 38.7, lng: -90.5 }];
    rerender(<PrecinctMap code="CC007" origin={ORIGIN} polls={more} />);
    expect(view.setPolls).toHaveBeenLastCalledWith(more);
    expect(createPrecinctMap).toHaveBeenCalledTimes(1);
  });

  it('redraws nothing when a new list has the same places and bins (#107)', async () => {
    const { rerender } = render(<PrecinctMap code="CC007" origin={ORIGIN} polls={POLLS} />);
    await waitFor(() => expect(createPrecinctMap).toHaveBeenCalled());
    rerender(<PrecinctMap code="CC007" origin={ORIGIN} polls={POLLS.map((p) => ({ ...p }))} />);
    expect(view.setPolls).not.toHaveBeenCalled();
    const binned = POLLS.map((p, i) => ({ ...p, bin: i === 0 ? 2 : null }));
    rerender(<PrecinctMap code="CC007" origin={ORIGIN} polls={binned} />);
    expect(view.setPolls).toHaveBeenLastCalledWith(binned);
  });

  it('shows the people-in-line legend only once a place has a count (#107)', async () => {
    const { rerender } = render(<PrecinctMap code="CC007" origin={ORIGIN} polls={POLLS} />);
    await waitFor(() => expect(createPrecinctMap).toHaveBeenCalled());
    expect(screen.queryByText('People in line')).toBeNull();
    const counted = POLLS.map((p) => ({ ...p, bin: null }));
    rerender(<PrecinctMap code="CC007" origin={ORIGIN} polls={counted} />);
    expect(screen.queryByText('People in line')).toBeNull();
    rerender(
      <PrecinctMap
        code="CC007"
        origin={ORIGIN}
        polls={[{ ...POLLS[0], bin: 0 }, counted[1]]}
        classes={[{ min: 3, max: 3 }]}
      />,
    );
    expect(screen.getByText('People in line')).toBeInTheDocument();
    // The legend names the class of the counts shown (#172).
    expect(screen.getByText('3 people')).toBeInTheDocument();
  });

  it('starts with the latest polling places when they change while it loads', async () => {
    let resolve;
    getPrecinctGeometry.mockReturnValue(new Promise((r) => (resolve = r)));
    const { rerender } = render(<PrecinctMap code="CC007" origin={ORIGIN} polls={POLLS} />);
    const more = [...POLLS, { lat: 38.7, lng: -90.5 }];
    rerender(<PrecinctMap code="CC007" origin={ORIGIN} polls={more} />);
    resolve(feature);
    await waitFor(() => expect(createPrecinctMap).toHaveBeenCalled());
    expect(options().polls).toEqual(more);
  });

  // #27: MapLibre is large and slow to start on a phone, so the map loads
  // only once it scrolls into view.
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

    const scrollIntoView = (isIntersecting = true) =>
      act(() => observers.at(-1).callback([{ isIntersecting }]));

    it('loads nothing and shows the placeholder until it scrolls into view', async () => {
      render(<PrecinctMap code="CC007" origin={ORIGIN} polls={POLLS} />);
      expect(observers.at(-1).observe).toHaveBeenCalledWith(region());
      expect(screen.getByTestId('map-placeholder')).toBeInTheDocument();
      scrollIntoView(false);
      await Promise.resolve();
      expect(getPrecinctGeometry).not.toHaveBeenCalled();
      expect(createPrecinctMap).not.toHaveBeenCalled();
      scrollIntoView();
      await waitFor(() => expect(createPrecinctMap).toHaveBeenCalledTimes(1));
      expect(getPrecinctGeometry).toHaveBeenCalledWith('CC007');
      expect(observers[0].disconnect).toHaveBeenCalled();
    });

    it('stops watching when the page goes away first', () => {
      const { unmount } = render(<PrecinctMap code="CC007" origin={ORIGIN} polls={POLLS} />);
      unmount();
      expect(observers.at(-1).disconnect).toHaveBeenCalled();
      expect(getPrecinctGeometry).not.toHaveBeenCalled();
    });

    it('starts the load time limit only once in view', async () => {
      vi.useFakeTimers();
      try {
        getPrecinctGeometry.mockReturnValue(new Promise(() => {}));
        render(<PrecinctMap code="CC007" origin={ORIGIN} polls={POLLS} />);
        act(() => vi.advanceTimersByTime(60_000));
        expect(region()).toBeInTheDocument();
        scrollIntoView();
        act(() => vi.advanceTimersByTime(14_999));
        expect(region()).toBeInTheDocument();
        act(() => vi.advanceTimersByTime(1));
        expect(screen.queryByRole('region')).toBeNull();
      } finally {
        vi.useRealTimers();
      }
    });
  });

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
      render(<PrecinctMap code="CC007" origin={ORIGIN} polls={POLLS} />);
      await act(() => vi.advanceTimersByTimeAsync(0));
      expect(createPrecinctMap).toHaveBeenCalled();
      act(() => vi.advanceTimersByTime(LIMIT - 1));
      expect(region()).toBeInTheDocument();
      act(() => vi.advanceTimersByTime(1));
      expect(screen.queryByRole('region')).toBeNull();
      expect(view.remove).toHaveBeenCalled();
    });

    it('counts the time the code and outline take to load', () => {
      vi.useFakeTimers();
      getPrecinctGeometry.mockReturnValue(new Promise(() => {}));
      render(<PrecinctMap code="CC007" origin={ORIGIN} polls={POLLS} />);
      act(() => vi.advanceTimersByTime(LIMIT));
      expect(screen.queryByRole('region')).toBeNull();
    });

    it('does not count time while the page is hidden', () => {
      vi.useFakeTimers();
      getPrecinctGeometry.mockReturnValue(new Promise(() => {}));
      render(<PrecinctMap code="CC007" origin={ORIGIN} polls={POLLS} />);
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

    it('does not restart the clock when the page is shown again', () => {
      vi.useFakeTimers();
      getPrecinctGeometry.mockReturnValue(new Promise(() => {}));
      render(<PrecinctMap code="CC007" origin={ORIGIN} polls={POLLS} />);
      for (let i = 0; i < 3; i += 1) {
        act(() => vi.advanceTimersByTime(5000));
        setVisibility('hidden');
        setVisibility('visible');
      }
      expect(screen.queryByRole('region')).toBeNull();
    });

    it('starts the clock only when a page that opened hidden is shown', () => {
      visibility = 'hidden';
      vi.useFakeTimers();
      getPrecinctGeometry.mockReturnValue(new Promise(() => {}));
      render(<PrecinctMap code="CC007" origin={ORIGIN} polls={POLLS} />);
      act(() => vi.advanceTimersByTime(LIMIT * 2));
      expect(region()).toBeInTheDocument();
      setVisibility('visible');
      act(() => vi.advanceTimersByTime(LIMIT));
      expect(screen.queryByRole('region')).toBeNull();
    });

    it('keeps a map that rendered in time', async () => {
      vi.useFakeTimers();
      render(<PrecinctMap code="CC007" origin={ORIGIN} polls={POLLS} />);
      await act(() => vi.advanceTimersByTimeAsync(0));
      act(() => options().onReady());
      act(() => vi.advanceTimersByTime(LIMIT * 2));
      expect(region()).toBeInTheDocument();
      expect(view.remove).not.toHaveBeenCalled();
    });
  });

  it('removes the map when the page goes away', async () => {
    const { unmount } = render(<PrecinctMap code="CC007" origin={ORIGIN} polls={POLLS} />);
    await waitFor(() => expect(createPrecinctMap).toHaveBeenCalled());
    unmount();
    expect(view.remove).toHaveBeenCalledTimes(1);
  });

  it('does not create a map after the page goes away', async () => {
    let resolve;
    getPrecinctGeometry.mockReturnValue(new Promise((r) => (resolve = r)));
    const { unmount } = render(<PrecinctMap code="CC007" origin={ORIGIN} polls={POLLS} />);
    unmount();
    resolve(feature);
    await new Promise((r) => setTimeout(r, 0));
    expect(createPrecinctMap).not.toHaveBeenCalled();
  });
});
