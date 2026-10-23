// A City component renders at once once the City chunk is here (#81), so a
// City summary at the top of the page never appears late and pushes it down.
import { render, screen } from '@testing-library/react';
import { Suspense } from 'react';
import { copy } from './resultsCopy.js';

beforeEach(() => {
  vi.resetModules();
});

async function load() {
  const { cityComponent } = await import('./cityComponent.js');
  const jurisdictions = await import('../../data/jurisdictions.js');
  return { Ballot: cityComponent('CitySampleBallotCard'), ...jurisdictions };
}

function renderIn(Component) {
  render(
    <Suspense fallback={<p>waiting</p>}>
      <Component />
    </Suspense>,
  );
}

describe('cityComponent', () => {
  it('suspends while the City chunk has not loaded, then shows the component', async () => {
    const { Ballot, loadedCityClient } = await load();
    expect(loadedCityClient()).toBeNull();
    renderIn(Ballot);
    expect(screen.getByText('waiting')).toBeInTheDocument();
    expect(await screen.findByText(copy.ballot.openCity)).toBeInTheDocument();
  });

  it('renders at once, with no fallback, once the City chunk has loaded', async () => {
    const { Ballot, loadCityClient, loadedCityClient } = await load();
    await loadCityClient();
    expect(loadedCityClient()).not.toBeNull();
    renderIn(Ballot);
    expect(screen.queryByText('waiting')).toBeNull();
    expect(screen.getByText(copy.ballot.openCity)).toBeInTheDocument();
  });
});
