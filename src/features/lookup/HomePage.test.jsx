import { render, screen, within } from '@testing-library/react';
import { Router } from 'wouter';
import { memoryLocation } from 'wouter/memory-location';
import cityResults from '../../config/cityResults.js';
import election from '../../config/election.js';
import referrals from '../../config/referrals.js';
import { copy as searchCopy } from './addressSearchCopy.js';
import { copy as ruleCopy } from './countyElectionDayRuleCopy.js';
import { copy } from './homeCopy.js';
import HomePage from './HomePage.jsx';

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

  // #80: the hero is the date, the heading, the intro and the nonpartisan
  // line, then the wait times link and the address search.
  it('puts the wait times link between the header and the address box', () => {
    const { container } = renderHome();
    const header = container.querySelector('header');
    const link = screen.getByRole('link', { name: copy.waitTimes });
    expect(header.compareDocumentPosition(link) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(header.contains(link)).toBe(false);
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
