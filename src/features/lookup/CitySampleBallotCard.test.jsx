import { render, screen } from '@testing-library/react';
import cityResults from '../../config/cityResults.js';
import CitySampleBallotCard from './CitySampleBallotCard.jsx';
import { formatLongDate } from './earlyVoting.js';
import { copy } from './resultsCopy.js';

const { url, sources, lastVerified } = cityResults.sampleBallot;
const escape = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

describe('CitySampleBallotCard (#92)', () => {
  it('links the City Board sample ballot PDF in a new tab', () => {
    render(<CitySampleBallotCard />);
    const link = screen.getByRole('link', { name: new RegExp(`^${escape(copy.ballot.openCity)}`) });
    expect(link).toHaveAttribute('href', url);
    expect(link).toHaveAttribute('target', '_blank');
    expect(link).toHaveAttribute('rel', 'noopener noreferrer');
    expect(link).toHaveAccessibleName(
      `${copy.ballot.openCity} ${copy.ballot.allPrecincts} ${copy.ballot.newTab}`,
    );
  });

  it('says it is the citywide ballot, never the voter precinct ballot', () => {
    const { container } = render(<CitySampleBallotCard />);
    expect(container).toHaveTextContent(copy.ballot.introCity);
    // Never the County card's "your sample ballot" words.
    expect(container.textContent).not.toContain(copy.ballot.open);
    expect(container.textContent).not.toContain(copy.ballot.intro);
    expect(container.textContent).not.toMatch(/your sample ballot/i);
  });

  it('cites the City Board page that lists it, with its last verified date', () => {
    render(<CitySampleBallotCard />);
    const source = screen.getByRole('link', { name: copy.polls.sourceNames['www.stlouis-mo.gov'] });
    expect(source).toHaveAttribute('href', sources[0]);
    expect(source.closest('p')).toHaveTextContent(
      copy.earlyVoting.lastVerified(formatLongDate(lastVerified, { year: true })),
    );
  });
});

describe('cityResults.sampleBallot', () => {
  it('is an https PDF on the City Board site, with a source and a date', () => {
    expect(url).toMatch(
      /^https:\/\/www\.stlouis-mo\.gov\/government\/departments\/board-election-commissioners\/.+\.pdf$/,
    );
    expect(sources.length).toBeGreaterThan(0);
    for (const source of sources) expect(source).toMatch(/^https:\/\//);
    expect(lastVerified).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});
