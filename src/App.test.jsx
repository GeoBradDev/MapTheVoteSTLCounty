import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Router } from 'wouter';
import { memoryLocation } from 'wouter/memory-location';
import App from './App.jsx';
import { learnCopy } from './features/learn/learnCopy.js';

// content/en/learn/ ships empty until #22, so the topic routes use fixtures.
vi.mock('./features/learn/topics.js', async (importOriginal) => {
  const actual = await importOriginal();
  const { fixtureTopics } = await import('./test/learnFixtures.js');
  return { ...actual, ...actual.topicLookups(actual.indexTopics(fixtureTopics)) };
});

// The precinct page loads its precinct; these tests only check routing, so the
// request never answers and nothing reaches the network.
beforeEach(() => {
  vi.stubGlobal(
    'fetch',
    vi.fn(() => new Promise(() => {})),
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
});

function renderAt(path) {
  const location = memoryLocation({ path, record: true });
  render(
    <Router hook={location.hook}>
      <App />
    </Router>,
  );
  return location;
}

function heading() {
  return screen.getByRole('heading', { level: 1 });
}

describe('App', () => {
  it('renders the main landmark with the app heading at /', () => {
    renderAt('/');

    expect(screen.getByRole('main')).toBeInTheDocument();
    expect(heading()).toHaveTextContent('St. Louis County Voter Guide');
    expect(screen.getByRole('combobox', { name: 'Enter your address' })).toBeInTheDocument();
  });

  it('renders the home page from the real browser location without a Router', () => {
    render(<App />);

    expect(heading()).toHaveTextContent('St. Louis County Voter Guide');
  });

  it('shows the precinct code from /p/:precinct', () => {
    renderAt('/p/CC007');

    expect(screen.getByRole('main')).toHaveTextContent('CC007');
    expect(heading()).not.toHaveTextContent('Page not found');
  });

  it('renders the learn page at /learn', () => {
    renderAt('/learn');

    expect(heading()).toHaveTextContent('How to vote');
  });

  it('renders a topic page at /learn/:topic', () => {
    renderAt('/learn/voter-id');

    expect(heading()).toHaveTextContent('Fixture ID topic');
    expect(screen.getByRole('link', { name: learnCopy.en.allTopics })).toHaveAttribute(
      'href',
      '/learn',
    );
  });

  it('renders the privacy notice at /privacy', () => {
    renderAt('/privacy');

    expect(heading()).toHaveTextContent('Privacy');
  });

  it.each(['/', '/p/CC007', '/learn', '/learn/voter-id', '/privacy', '/nope'])(
    'links to the privacy notice from the footer, outside main, on %s',
    (path) => {
      renderAt(path);

      const footer = screen.getByRole('contentinfo');
      const link = within(footer).getByRole('link', { name: 'Privacy' });
      expect(link).toHaveAttribute('href', '/privacy');
      expect(screen.getByRole('main')).not.toContainElement(footer);
    },
  );

  it('opens the privacy notice from the footer without a full reload', async () => {
    const location = renderAt('/');

    await userEvent.click(
      within(screen.getByRole('contentinfo')).getByRole('link', { name: 'Privacy' }),
    );

    expect(location.history).toEqual(['/', '/privacy']);
    expect(heading()).toHaveTextContent('Privacy');
    expect(heading()).toHaveFocus();
  });

  it.each(['/p/CC007/', '/learn/', '/learn/voter-id/', '/privacy/'])(
    'treats a trailing slash as the same page for %s',
    (path) => {
      renderAt(path);

      expect(heading()).not.toHaveTextContent('Page not found');
    },
  );

  it.each([
    '/nope',
    '/p',
    '/p/CC007/extra',
    '/learn/a/b',
    '/learn/no-such-topic',
    '/privacy/extra',
  ])('shows the not-found page inside main for %s', (path) => {
    renderAt(path);

    const main = screen.getByRole('main');
    expect(heading()).toHaveTextContent('Page not found');
    expect(main).toContainElement(heading());
    expect(screen.getByRole('link', { name: /home page/i })).toHaveAttribute('href', '/');
    expect(screen.getByRole('combobox', { name: 'Enter your address' })).toBeInTheDocument();
  });

  it('navigates home from the not-found page without a full reload', async () => {
    const location = renderAt('/nope');

    await userEvent.click(screen.getByRole('link', { name: /home page/i }));

    expect(location.history).toEqual(['/nope', '/']);
    expect(heading()).toHaveTextContent('St. Louis County Voter Guide');
  });
});
