// The results cards read their data through the page's jurisdiction (#86).
import { render, screen } from '@testing-library/react';
import polls from '../../../docs/raw/fixtures/polls.json';
import geometry from '../../../docs/raw/fixtures/precinct-geometry.json';
import { city, county } from '../../data/jurisdictions.js';
import { JurisdictionContext, useJurisdiction } from './jurisdictionContext.js';
import PollsCard from './PollsCard.jsx';
import { copy } from './resultsCopy.js';

function Shown() {
  return <p>{useJurisdiction().id}</p>;
}

describe('JurisdictionContext', () => {
  it('is the County when no page provides one', () => {
    render(<Shown />);
    expect(screen.getByText(county.id)).toBeInTheDocument();
  });

  it('gives the cards the jurisdiction the page provides', async () => {
    const fake = {
      ...city,
      getPolls: vi.fn().mockResolvedValue(polls),
      getOutline: vi.fn().mockResolvedValue(geometry.features[0]),
    };
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    try {
      render(
        <JurisdictionContext value={fake}>
          <PollsCard code="W01P12" origin={null} />
        </JurisdictionContext>,
      );
      expect(await screen.findByRole('list', { name: copy.polls.listLabel })).toBeInTheDocument();
      expect(fake.getPolls).toHaveBeenCalled();
      expect(fake.getOutline).toHaveBeenCalledWith('W01P12');
      expect(fetchSpy).not.toHaveBeenCalled();
    } finally {
      fetchSpy.mockRestore();
    }
  });
});
