// The wait times page's map (#104): extra help only, loaded on demand, with a
// legend that names the unit and hides when no site has a count.
import { act, render, screen, waitFor, within } from '@testing-library/react';
import { BASEMAP_ATTRIBUTION } from '../lookup/basemap.js';
import { WAIT_BINS } from './siteOrder.js';
import WaitTimesMap from './WaitTimesMap.jsx';
import { createWaitTimesMap } from './waitTimesMapView.js';
import { copy } from './waitTimesCopy.js';

vi.mock('./waitTimesMapView.js', () => ({ createWaitTimesMap: vi.fn() }));

const SITES = [
  { lat: 38.73, lng: -90.4, bin: 0 },
  { lat: 38.6, lng: -90.3, bin: null },
  { lat: 38.5, lng: -90.5, bin: 2 },
];
let view;

beforeEach(() => {
  view = { setSites: vi.fn(), remove: vi.fn() };
  createWaitTimesMap.mockReset().mockReturnValue(view);
});

const region = () => screen.getByRole('region', { name: copy.map.label });

describe('WaitTimesMap', () => {
  it('draws every site, numbered in list order', async () => {
    render(<WaitTimesMap sites={SITES} />);
    await waitFor(() => expect(createWaitTimesMap).toHaveBeenCalledTimes(1));
    const [container, { sites }] = createWaitTimesMap.mock.calls[0];
    expect(region()).toContainElement(container);
    expect(sites).toEqual(SITES);
    expect(region()).toHaveTextContent(copy.map.numbers);
  });

  it('passes a new order to the drawn map', async () => {
    const { rerender } = render(<WaitTimesMap sites={SITES} />);
    await waitFor(() => expect(createWaitTimesMap).toHaveBeenCalled());
    const next = [...SITES].reverse();
    rerender(<WaitTimesMap sites={next} />);
    expect(view.setSites).toHaveBeenLastCalledWith(next);
  });

  it('shows a legend naming the unit and each bin when a site has a count', () => {
    render(<WaitTimesMap sites={SITES} />);
    const legend = within(region()).getByRole('list', { name: copy.map.legend });
    for (const bin of WAIT_BINS) expect(legend).toHaveTextContent(copy.map.bin(bin));
    expect(legend).toHaveTextContent(copy.map.noCount);
  });

  it('hides the legend when no site has a count', () => {
    render(<WaitTimesMap sites={SITES.map((s) => ({ ...s, bin: null }))} />);
    expect(within(region()).queryByRole('list', { name: copy.map.legend })).toBeNull();
    expect(region()).not.toHaveTextContent(copy.map.legend);
  });

  it('credits the basemap', () => {
    render(<WaitTimesMap sites={SITES} />);
    for (const { label, href } of BASEMAP_ATTRIBUTION) {
      expect(within(region()).getByRole('link', { name: label })).toHaveAttribute('href', href);
    }
  });

  it('goes away when the map fails', async () => {
    render(<WaitTimesMap sites={SITES} />);
    await waitFor(() => expect(createWaitTimesMap).toHaveBeenCalled());
    const { onFail } = createWaitTimesMap.mock.calls[0][1];
    act(() => onFail(new Error('no tiles')));
    expect(screen.queryByRole('region', { name: copy.map.label })).toBeNull();
  });

  it('frees the map when it goes', async () => {
    const { unmount } = render(<WaitTimesMap sites={SITES} />);
    await waitFor(() => expect(createWaitTimesMap).toHaveBeenCalled());
    unmount();
    expect(view.remove).toHaveBeenCalled();
  });
});
