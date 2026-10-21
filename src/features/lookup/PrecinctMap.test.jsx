import { render, screen, waitFor, within } from '@testing-library/react';
import geometry from '../../../docs/raw/fixtures/precinct-geometry.json';
import election from '../../config/election.js';
import { getPrecinctGeometry } from '../../data/arcgis.js';
import { BASEMAP_ATTRIBUTION } from './basemap.js';
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
