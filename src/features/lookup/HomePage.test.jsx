import { render, screen, within } from '@testing-library/react';
import { Router } from 'wouter';
import { memoryLocation } from 'wouter/memory-location';
import election from '../../config/election.js';
import { copy as searchCopy } from './addressSearchCopy.js';
import { copy as ruleCopy } from './assignedPollingPlaceCopy.js';
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

  it('says Election Day voters must use their assigned polling place, with sources (#72)', () => {
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
    expect(container).not.toHaveTextContent(/any polling place/i);
  });

  it('links to "How to vote" and the official county election site', () => {
    renderHome();
    expect(screen.getByRole('link', { name: copy.howToVote })).toHaveAttribute('href', '/learn');
    expect(screen.getByRole('link', { name: copy.countySite })).toHaveAttribute(
      'href',
      election.countySiteUrl,
    );
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
