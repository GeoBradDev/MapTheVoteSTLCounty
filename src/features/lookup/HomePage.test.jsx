import { render, screen, within } from '@testing-library/react';
import { Router } from 'wouter';
import { memoryLocation } from 'wouter/memory-location';
import election from '../../config/election.js';
import { copy as searchCopy } from './addressSearchCopy.js';
import { copy } from './homeCopy.js';
import HomePage from './HomePage.jsx';

function renderHome() {
  const { hook } = memoryLocation({ path: '/' });
  render(
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

  it('states the vote-anywhere rule with a link to its official source', () => {
    renderHome();
    const line = screen.getByText(copy.voteAnywhere).closest('p');
    expect(within(line).getByRole('link', { name: copy.voteAnywhereSource })).toHaveAttribute(
      'href',
      election.voteAnywhere.sources[0],
    );
  });

  it('links to "How to vote" and the official county election site', () => {
    renderHome();
    expect(screen.getByRole('link', { name: copy.howToVote })).toHaveAttribute('href', '/learn');
    expect(screen.getByRole('link', { name: copy.countySite })).toHaveAttribute(
      'href',
      election.countySiteUrl,
    );
  });

  it('names no party or candidate', () => {
    const text = JSON.stringify(copy).toLowerCase();
    for (const word of ['democrat', 'republican', 'libertarian', 'green party', 'candidate']) {
      expect(text).not.toContain(word);
    }
  });
});
