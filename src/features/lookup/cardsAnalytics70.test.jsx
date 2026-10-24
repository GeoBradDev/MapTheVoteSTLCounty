// Issue #70: the results cards count the sample ballot, directions, official
// lookup, Try again and Share presses with fixed labels only, and never stop
// a link from opening. GA is forced on (trackEvents), so the events are read
// from the real dataLayer, past the real allowlist in src/analytics/ga.js.
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import cc007 from '../../../docs/raw/fixtures/precinct-by-id.json';
import sites from '../../../docs/raw/fixtures/absentee-sites.json';
import polls from '../../../docs/raw/fixtures/polls.json';
import geometry from '../../../docs/raw/fixtures/precinct-geometry.json';
import { getAbsenteeSites, getPolls, getPrecinctGeometry } from '../../data/arcgis.js';
import { pressLink, trackEvents } from '../../test/trackedEvents.js';
import CitySampleBallotCard from './CitySampleBallotCard.jsx';
import DistrictsCard from './DistrictsCard.jsx';
import EarlyVotingCard from './EarlyVotingCard.jsx';
import { copy as errorCopy } from './errorCopy.js';
import OutOfCountyNotice from './OutOfCountyNotice.jsx';
import { copy as noticeCopy } from './outOfCountyCopy.js';
import PrecinctStatusBanner from './PrecinctStatusBanner.jsx';
import PollsCard from './PollsCard.jsx';
import { copy } from './resultsCopy.js';
import SampleBallotCard from './SampleBallotCard.jsx';
import ShareLink from './ShareLink.jsx';

vi.mock('../../data/arcgis.js', () => ({
  getPolls: vi.fn(),
  getAbsenteeSites: vi.fn(),
  getPrecinctGeometry: vi.fn(),
  getCountyWaits: vi.fn(async () => []),
  getCityWaits: vi.fn(async () => []),
}));
vi.mock('./precinctMapView.js', () => ({ createPrecinctMap: vi.fn() }));

const ORIGIN = { lat: 38.66, lng: -90.45 };
const escape = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)';

let tracked;
beforeEach(() => {
  getPrecinctGeometry.mockReset().mockResolvedValue(geometry.features[0]);
  getPolls.mockReset();
  getAbsenteeSites.mockReset();
  tracked = trackEvents();
});
afterEach(() => {
  tracked.stop();
  vi.unstubAllGlobals();
  delete navigator.share;
  delete navigator.clipboard;
});

// Nothing the cards show about a place, or its URL, is ever sent: the
// events, and every entry but the redacted page fields #69 sets.
async function expectOnlyLabels() {
  expect(JSON.stringify(await tracked.events())).not.toMatch(/https?:|\.com|\d/);
  const sent = JSON.stringify(tracked.calls());
  expect(sent).not.toMatch(/CC007|CC-007|google\.com|apple\.com|maps|\.pdf|38\.|90\./i);
}

const cases = [
  ['PollsCard', PollsCard, () => getPolls, polls, 'polls', copy.polls.listLabel],
  [
    'EarlyVotingCard',
    EarlyVotingCard,
    () => getAbsenteeSites,
    sites,
    'early_voting',
    copy.earlyVoting.listLabel,
  ],
];

describe.each(cases)('%s', (_, Card, load, data, card, listLabel) => {
  it('counts a directions press by card and provider, and lets it open', async () => {
    vi.stubGlobal('navigator', { ...navigator, userAgent: IPHONE });
    load().mockResolvedValue(data);
    render(<Card code="CC007" origin={ORIGIN} />);
    const [row] = within(await screen.findByRole('list', { name: listLabel })).getAllByRole(
      'listitem',
    );
    const google = within(row).getByRole('link', {
      name: new RegExp(escape(copy.polls.directions)),
    });
    const apple = within(row).getByRole('link', { name: new RegExp(escape(copy.polls.appleMaps)) });
    expect(await pressLink(userEvent.click, google)).toBe(false);
    expect(await pressLink(userEvent.click, apple)).toBe(false);
    expect(await tracked.events()).toEqual([
      ['directions_open', { card, provider: 'google' }],
      ['directions_open', { card, provider: 'apple' }],
    ]);
    await expectOnlyLabels();
  });

  it('counts its official lookup link and Try again after a failure', async () => {
    load().mockRejectedValueOnce(new Error('HTTP 503')).mockResolvedValueOnce(data);
    render(<Card code="CC007" origin={ORIGIN} />);
    const lookup = await screen.findByRole('link', { name: copy.officialLookup });
    expect(await pressLink(userEvent.click, lookup)).toBe(false);
    await userEvent.click(screen.getByRole('button', { name: errorCopy.retry }));
    await screen.findByRole('list', { name: listLabel });
    expect(await tracked.events()).toEqual([
      ['official_lookup_open', { card }],
      ['retry', { where: card }],
    ]);
  });
});

describe('SampleBallotCard', () => {
  it('counts opening the sample ballot, with nothing about it, and lets it open', async () => {
    render(<SampleBallotCard html={cc007.features[0].attributes.html} code="CC007" />);
    const link = screen.getByRole('link', { name: new RegExp(`^${escape(copy.ballot.open)}`) });
    expect(await pressLink(userEvent.click, link)).toBe(false);
    expect(await tracked.events()).toEqual([['sample_ballot_open', {}]]);
    await expectOnlyLabels();
  });

  it('counts the official lookup link shown in its place', async () => {
    render(<SampleBallotCard html="" code="CC007" />);
    const link = screen.getByRole('link', { name: copy.officialLookup });
    expect(await pressLink(userEvent.click, link)).toBe(false);
    expect(await tracked.events()).toEqual([['official_lookup_open', { card: 'sample_ballot' }]]);
  });
});

it('CitySampleBallotCard counts opening the City sample ballot the same way (#92)', async () => {
  render(<CitySampleBallotCard />);
  const link = screen.getByRole('link', { name: new RegExp(`^${escape(copy.ballot.openCity)}`) });
  expect(await pressLink(userEvent.click, link)).toBe(false);
  expect(await tracked.events()).toEqual([['sample_ballot_open', {}]]);
  await expectOnlyLabels();
});

it('DistrictsCard counts the official lookup link when the districts are missing', async () => {
  render(<DistrictsCard precinct={{}} />);
  const link = screen.getByRole('link', { name: copy.officialLookup });
  expect(await pressLink(userEvent.click, link)).toBe(false);
  expect(await tracked.events()).toEqual([['official_lookup_open', { card: 'districts' }]]);
});

describe('ShareLink', () => {
  const stub = ({ share, clipboard } = {}) => {
    Object.defineProperty(navigator, 'share', { value: share, configurable: true });
    Object.defineProperty(navigator, 'clipboard', { value: clipboard, configurable: true });
  };
  const press = () => userEvent.click(screen.getByRole('button', { name: copy.share.button }));

  it.each([
    ['share_sheet', { share: vi.fn(async () => {}) }],
    ['clipboard', { clipboard: { writeText: vi.fn(async () => {}) } }],
    ['manual', { clipboard: { writeText: vi.fn(async () => Promise.reject(new Error('no'))) } }],
  ])('counts a finished share as %s, without the link', async (method, nav) => {
    stub(nav);
    render(<ShareLink code="CC007" />);
    await press();
    expect(await tracked.events()).toEqual([['share', { method }]]);
    await expectOnlyLabels();
  });

  it('counts nothing when the voter closes the share sheet', async () => {
    stub({ share: vi.fn(async () => Promise.reject(new DOMException('x', 'AbortError'))) });
    render(<ShareLink code="CC007" />);
    await press();
    expect(await tracked.events()).toEqual([]);
  });
});

describe('OutOfCountyNotice', () => {
  // Only its links to a board's official lookup; the City board's page and
  // Missouri's voter outreach page are not lookups.
  it.each([
    ['stl-city', noticeCopy['stl-city']],
    ['county-unmatched', noticeCopy['county-unmatched']],
  ])('counts the official lookup link of the %s notice as a referral', async (kind, notice) => {
    render(<OutOfCountyNotice kind={kind} />);
    const labels = notice.paragraphs
      .map(({ link }) => link)
      .filter((link) => link && /Lookup$/.test(link.href));
    expect(labels).toHaveLength(1);
    const link = screen.getByRole('link', { name: labels[0].label });
    expect(await pressLink(userEvent.click, link)).toBe(false);
    expect(await tracked.events()).toEqual([['official_lookup_open', { card: 'referral' }]]);
  });

  it.each(['stl-city', 'missouri', 'unknown'])(
    'counts nothing for the other links of the %s notice',
    async (kind) => {
      render(<OutOfCountyNotice kind={kind} />);
      const others = noticeCopy[kind].paragraphs
        .map(({ link }) => link)
        .filter((link) => link && !/Lookup$/.test(link.href));
      expect(others.length).toBeGreaterThan(0);
      for (const { label } of others) {
        await pressLink(userEvent.click, screen.getByRole('link', { name: label }));
      }
      expect(await tracked.events()).toEqual([]);
    },
  );
});

it('PrecinctStatusBanner counts its official lookup link when the status is unknown', async () => {
  render(<PrecinctStatusBanner status={{ kind: 'unknown' }} />);
  const link = screen.getByRole('link', { name: copy.officialLookup });
  expect(await pressLink(userEvent.click, link)).toBe(false);
  expect(await tracked.events()).toEqual([['official_lookup_open', { card: 'status' }]]);
});
