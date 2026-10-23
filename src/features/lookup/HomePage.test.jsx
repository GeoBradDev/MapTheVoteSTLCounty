import { act, render, screen, within } from '@testing-library/react';
import { Router } from 'wouter';
import { memoryLocation } from 'wouter/memory-location';
import cityResults from '../../config/cityResults.js';
import election from '../../config/election.js';
import referrals from '../../config/referrals.js';
import { copy as searchCopy } from './addressSearchCopy.js';
import { copy as ruleCopy } from './countyElectionDayRuleCopy.js';
import { copy } from './homeCopy.js';
import HomePage from './HomePage.jsx';

// The dot map's own chunk (#184), stood in for: WaitDotMap.test.jsx covers it.
const dotMap = vi.hoisted(() => ({ onClose: null, throws: false }));
vi.mock('../waitTimes/WaitDotMap.jsx', () => ({
  default: function WaitDotMapStub({ onClose }) {
    dotMap.onClose = onClose;
    if (dotMap.throws) throw new Error('chunk broke');
    return <p data-testid="dot-map">dot map</p>;
  },
}));

function renderHome() {
  const { hook } = memoryLocation({ path: '/' });
  return render(
    <Router hook={hook}>
      <HomePage />
    </Router>,
  );
}

describe('HomePage', () => {
  it('names the guide and Election Day from the config, as one compact line (#80)', () => {
    const { container } = renderHome();
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(copy.heading);
    const date = screen.getByText(copy.electionDay(election.electionDate, election.timeZone));
    expect(date.closest('time')).toHaveAttribute('datetime', election.electionDate);
    // One date line: no separate eyebrow repeating the date.
    expect(screen.queryByText(election.electionName)).toBeNull();
    // The page's own header: inside the app's main it has no banner role.
    const header = container.querySelector('header');
    expect(header.querySelectorAll('time')).toHaveLength(1);
  });

  // The first action next to the address search (#104): no address needed.
  it('links to the early voting wait times before the address search', () => {
    renderHome();
    const link = screen.getByRole('link', { name: copy.waitTimes });
    expect(link).toHaveAttribute('href', '/early-voting');
    expect(
      link.compareDocumentPosition(screen.getByRole('combobox')) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  it('names the same link for the Election Day line counts on Election Day (#107)', () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    // 9 a.m. Central on Election Day, November 3, 2026.
    vi.setSystemTime(Date.UTC(2026, 10, 3, 15));
    try {
      renderHome();
      expect(screen.getByRole('link', { name: copy.waitTimesElectionDay })).toHaveAttribute(
        'href',
        '/early-voting',
      );
      expect(screen.queryByRole('link', { name: copy.waitTimes })).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });

  it('formats Election Day in the election time zone', () => {
    expect(copy.electionDay('2030-11-05', 'America/Chicago')).toBe(
      'Election Day: Tue, Nov 5, 2030',
    );
  });

  it('has one address box and the "Use my location" button', () => {
    renderHome();
    expect(screen.getAllByRole('combobox')).toHaveLength(1);
    expect(screen.getByRole('combobox', { name: searchCopy.label })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /use my location/i })).toBeInTheDocument();
  });

  // #165: the precinct pages state each jurisdiction's own Election Day rule;
  // the home page, which serves City and County voters alike, states none.
  it('states no Election Day rule for either jurisdiction (#165)', () => {
    const { container } = renderHome();
    expect(container).not.toHaveTextContent(ruleCopy.rule);
    expect(container).not.toHaveTextContent(ruleCopy.cityNote);
    expect(container).not.toHaveTextContent(ruleCopy.help);
    expect(container).not.toHaveTextContent(election.electionDayPollingPlace.phone);
    expect(container).not.toHaveTextContent(cityResults.electionDayRule.quote);
    expect(container).not.toHaveTextContent(/any polling place|assigned polling place/i);
    const { sources, phoneSource } = election.electionDayPollingPlace;
    for (const url of [...sources, phoneSource]) {
      expect(container.querySelector(`a[href="${url}"]`)).toBeNull();
    }
  });

  // The app focuses the h1 after an in-app link (App.jsx), so a screen reader
  // reads on from there: the date must come after the heading, not before it.
  it('puts the election date after the heading, where reading from the focused h1 reaches it', () => {
    renderHome();
    const h1 = screen.getByRole('heading', { level: 1 });
    const date = screen
      .getByText(copy.electionDay(election.electionDate, election.timeZone))
      .closest('time');
    expect(h1.compareDocumentPosition(date) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  // #80: the hero is the heading, the date, the intro and the nonpartisan
  // line, then the wait times link and the address search.
  it('puts the wait times link between the header and the address box', () => {
    const { container } = renderHome();
    const header = container.querySelector('header');
    const link = screen.getByRole('link', { name: copy.waitTimes });
    expect(header.compareDocumentPosition(link) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(header.contains(link)).toBe(false);
    expect(
      link.compareDocumentPosition(screen.getByRole('combobox')) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  it('shows "How to vote" and both boards as full-width rows in its own list', () => {
    renderHome();
    const nav = screen.getByRole('navigation', { name: copy.moreInfo });
    const links = within(nav).getAllByRole('link');
    expect(links.map((a) => a.textContent)).toEqual([
      copy.howToVote,
      copy.countySite,
      copy.citySite,
    ]);
    for (const a of links) expect(a).toHaveClass('flex', 'min-h-11', 'w-full', 'border');
  });

  it('links to "How to vote" and both official election sites (#93)', () => {
    renderHome();
    const nav = screen.getByRole('navigation', { name: copy.moreInfo });
    expect(within(nav).getByRole('link', { name: copy.howToVote })).toHaveAttribute(
      'href',
      '/learn',
    );
    expect(within(nav).getByRole('link', { name: copy.countySite })).toHaveAttribute(
      'href',
      election.countySiteUrl,
    );
    expect(within(nav).getByRole('link', { name: copy.citySite })).toHaveAttribute(
      'href',
      referrals.stlCityBoard.url,
    );
  });

  // #93: the guide is for City and County voters alike.
  it('says it covers both the City and the County', () => {
    renderHome();
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('St. Louis Voter Guide');
    expect(screen.getByText(copy.intro)).toHaveTextContent(/St\. Louis City and St\. Louis County/);
  });

  it('says in its header, under the intro, that this is an independent, nonpartisan guide', () => {
    renderHome();
    const line = screen.getByText(copy.unofficial);
    expect(line).toHaveTextContent(/nonpartisan/i);
    expect(line).toHaveTextContent(/not an official/i);
    expect(screen.getByText(copy.intro).nextElementSibling).toBe(line);
  });

  it('names no party or candidate', () => {
    const text = JSON.stringify(copy).toLowerCase();
    for (const word of ['democrat', 'republican', 'libertarian', 'green party', 'candidate']) {
      expect(text).not.toContain(word);
    }
  });
});

// The line count dot map (#184): in its own box between the header and the
// wait times link, only during early voting and on Election Day.
describe('HomePage dot map', () => {
  // 9:05 a.m. Central on 2026-10-22, during early voting; a day in August;
  // 7:30 p.m. Central on Election Day, after the polls close.
  const OPEN_AT = Date.UTC(2026, 9, 22, 14, 5);
  const BEFORE_AT = Date.UTC(2026, 7, 10, 15, 0);
  const AFTER_POLLS_AT = Date.UTC(2026, 10, 4, 1, 30);
  const box = (container) => container.querySelector('[data-home-map-box]');

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    dotMap.onClose = null;
    dotMap.throws = false;
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('opens the box during early voting, after the header and before the wait times link', async () => {
    vi.setSystemTime(OPEN_AT);
    const { container } = renderHome();
    const map = await screen.findByTestId('dot-map');
    expect(box(container)).toHaveAttribute('data-open');
    expect(box(container)).not.toHaveAttribute('data-closed');
    const header = container.querySelector('header');
    const link = screen.getByRole('link', { name: copy.waitTimes });
    expect(header.compareDocumentPosition(map) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(map.compareDocumentPosition(link) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it.each([
    ['before early voting', BEFORE_AT, copy.waitTimes],
    ['after the polls close', AFTER_POLLS_AT, copy.waitTimesElectionDay],
  ])('keeps the box closed %s, with the page as it was', (_, at, linkName) => {
    vi.setSystemTime(at);
    const { container } = renderHome();
    expect(box(container)).toHaveAttribute('data-closed');
    expect(box(container)).toBeEmptyDOMElement();
    expect(screen.getByRole('link', { name: linkName })).toBeInTheDocument();
  });

  it('closes the box when the map asks, keeping the wait times link', async () => {
    vi.setSystemTime(OPEN_AT);
    const { container } = renderHome();
    await screen.findByTestId('dot-map');
    act(() => dotMap.onClose());
    expect(box(container)).toHaveAttribute('data-closed');
    expect(screen.queryByTestId('dot-map')).toBeNull();
    expect(screen.getByRole('link', { name: copy.waitTimes })).toBeInTheDocument();
  });

  it('closes the box when the map fails to load or render', async () => {
    vi.setSystemTime(OPEN_AT);
    dotMap.throws = true;
    // React reports the caught error to the console.
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      const { container } = renderHome();
      await vi.waitFor(() => expect(box(container)).toHaveAttribute('data-closed'));
      expect(screen.getByRole('combobox')).toBeInTheDocument();
    } finally {
      error.mockRestore();
    }
  });

  it('is pre-rendered as an empty box with neither mark, so the CSS decides (#99)', async () => {
    const { renderToString } = await import('react-dom/server');
    vi.setSystemTime(OPEN_AT);
    const html = renderToString(
      <Router ssrPath="/">
        <HomePage />
      </Router>,
    );
    expect(html).toMatch(/<div data-home-map-box=""[^>]*><\/div>/);
    expect(html).not.toMatch(/data-open|data-closed/);
  });
});
