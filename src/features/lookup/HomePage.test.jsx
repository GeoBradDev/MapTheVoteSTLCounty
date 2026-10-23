import { render, screen, within } from '@testing-library/react';
import { Router } from 'wouter';
import { memoryLocation } from 'wouter/memory-location';
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
  it('names the guide, the election and Election Day from the config', () => {
    renderHome();
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(copy.heading);
    expect(screen.getByText(election.electionName)).toBeInTheDocument();
    const date = screen.getByText(copy.electionDay(election.electionDate, election.timeZone));
    expect(date.closest('time') ?? date.querySelector('time')).toHaveAttribute(
      'datetime',
      election.electionDate,
    );
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
      'Election Day is Tuesday, November 5, 2030.',
    );
  });

  it('has one address box and the "Use my location" button', () => {
    renderHome();
    expect(screen.getAllByRole('combobox')).toHaveLength(1);
    expect(screen.getByRole('combobox', { name: searchCopy.label })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /use my location/i })).toBeInTheDocument();
  });

  it('says a County voter may vote at any County polling place, with sources (#152)', () => {
    const { container } = renderHome();
    const box = screen.getByText(ruleCopy.rule).closest('div');
    expect(
      within(box).getByRole('link', { name: election.electionDayPollingPlace.phone }),
    ).toBeInTheDocument();
    for (const url of election.electionDayPollingPlace.sources) {
      expect(
        within(box).getByRole('link', { name: ruleCopy.sourceNames[new URL(url).host] }),
      ).toHaveAttribute('href', url);
    }
    expect(within(box).getByText(ruleCopy.cityNote)).toBeInTheDocument();
    expect(container).not.toHaveTextContent(/assigned polling place/i);
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
