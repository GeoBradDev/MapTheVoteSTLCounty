// Issue #18: a card whose data fails says so on its own, with the official
// lookup and "Try again"; a retry keeps focus on its button while it runs and
// hands focus to the card body when the list replaces the button.
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import sites from '../../../docs/raw/fixtures/absentee-sites.json';
import polls from '../../../docs/raw/fixtures/polls.json';
import geometry from '../../../docs/raw/fixtures/precinct-geometry.json';
import { getAbsenteeSites, getPolls, getPrecinctGeometry } from '../../data/arcgis.js';
import EarlyVotingCard from './EarlyVotingCard.jsx';
import { copy as errorCopy } from './errorCopy.js';
import PollsCard from './PollsCard.jsx';
import { copy } from './resultsCopy.js';

vi.mock('../../data/arcgis.js', () => ({
  getPolls: vi.fn(),
  getAbsenteeSites: vi.fn(),
  getPrecinctGeometry: vi.fn(),
}));
vi.mock('./precinctMapView.js', () => ({ createPrecinctMap: vi.fn() }));

const ORIGIN = { lat: 38.66, lng: -90.45 };

beforeEach(() => {
  getPrecinctGeometry.mockReset().mockResolvedValue(geometry.features[0]);
  getPolls.mockReset();
  getAbsenteeSites.mockReset();
});

const cases = [
  {
    name: 'PollsCard',
    load: () => getPolls,
    data: polls,
    Card: PollsCard,
    failed: copy.polls.failed,
    listLabel: copy.polls.listLabel,
  },
  {
    name: 'EarlyVotingCard',
    load: () => getAbsenteeSites,
    data: sites,
    Card: EarlyVotingCard,
    failed: copy.earlyVoting.failed,
    listLabel: copy.earlyVoting.listLabel,
  },
];

describe.each(cases)('$name failure (#18)', ({ load, data, Card, failed, listLabel }) => {
  it('offers the official lookup and "Try again", which loads the list', async () => {
    let finish;
    load()
      .mockRejectedValueOnce(new Error('HTTP 503'))
      .mockReturnValueOnce(new Promise((resolve) => (finish = resolve)));
    render(<Card code="CC007" origin={ORIGIN} />);
    const message = await screen.findByText(failed, { exact: false });
    expect(message.querySelector('a')).toHaveAccessibleName(copy.officialLookup);
    const retry = screen.getByRole('button', { name: errorCopy.retry });
    await userEvent.click(retry);
    const busy = screen.getByRole('button', { name: errorCopy.retrying });
    expect(busy).toHaveFocus();
    expect(busy).toHaveAttribute('aria-disabled', 'true');
    expect(load()).toHaveBeenCalledTimes(2);
    finish(data);
    expect(await screen.findByRole('list', { name: listLabel })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: errorCopy.retrying })).toBeNull();
    // Focus does not fall back to the page.
    expect(document.activeElement).not.toBe(document.body);
    expect(document.activeElement).toContainElement(screen.getByRole('list', { name: listLabel }));
  });

  it('keeps the button and its focus when the retry fails again', async () => {
    load().mockRejectedValue(new Error('HTTP 503'));
    render(<Card code="CC007" origin={ORIGIN} />);
    await userEvent.click(await screen.findByRole('button', { name: errorCopy.retry }));
    const again = await screen.findByRole('button', { name: errorCopy.retry });
    expect(again).toHaveFocus();
    expect(load()).toHaveBeenCalledTimes(2);
  });
});
