// Issue #70: the wait times page counts its directions, official lookup and
// Try again presses as the page's, with fixed labels only: never a site, a
// count, a distance or the device's location.
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Router } from 'wouter';
import { memoryLocation } from 'wouter/memory-location';
import sites from '../../../docs/raw/fixtures/absentee-sites.json';
import countyEmptyBody from '../../../docs/raw/fixtures/county-waits-empty.json';
import { selectCountyWaits } from '../../data/waitTimes.js';
import { pressLink, trackEvents } from '../../test/trackedEvents.js';
import { copy as resultsCopy } from '../lookup/resultsCopy.js';
import { createWaitTimesStore } from './useWaitTimes.js';
import WaitTimesPage from './WaitTimesPage.jsx';
import { copy } from './waitTimesCopy.js';

vi.mock('./waitTimesMapView.js', () => ({ createWaitTimesMap: vi.fn() }));

const countyEmpty = async () =>
  selectCountyWaits(
    countyEmptyBody.features.map((f) => f.attributes),
    sites.features,
  );
const noCity = async () => ({ layer: { features: [] }, scheduleFor: () => null, schedules: {} });

let tracked;
beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(Date.UTC(2026, 9, 22, 14, 0));
  tracked = trackEvents();
});
afterEach(() => {
  tracked.stop();
  vi.useRealTimers();
});

function renderPage(loadSites) {
  render(
    <Router hook={memoryLocation({ path: '/early-voting' }).hook}>
      <WaitTimesPage
        loadSites={loadSites}
        loadCity={noCity}
        waitSource={createWaitTimesStore({ county: countyEmpty, city: null })}
      />
    </Router>,
  );
}

it('counts the official lookup link and Try again after a failure, then directions', async () => {
  let down = true;
  renderPage(async () => {
    if (down) throw new Error('down');
    return sites;
  });
  await screen.findByText(new RegExp(copy.failed));
  const [lookup] = screen.getAllByRole('link', { name: /official lookup/i });
  expect(await pressLink(userEvent.click, lookup)).toBe(false);
  down = false;
  await userEvent.click(screen.getByRole('button', { name: /try again/i }));
  const list = await screen.findByRole('list', { name: copy.listLabel });
  const [row] = within(list).getAllByRole('listitem');
  const directions = within(row).getByRole('link', {
    name: new RegExp(`^${resultsCopy.polls.directions}`),
  });
  expect(await pressLink(userEvent.click, directions)).toBe(false);
  expect(await tracked.events()).toEqual([
    ['official_lookup_open', { card: 'wait_times' }],
    ['retry', { where: 'wait_times' }],
    ['directions_open', { card: 'wait_times', provider: 'google' }],
  ]);
  expect(JSON.stringify(await tracked.events())).not.toMatch(/\d|https?:/);
});
