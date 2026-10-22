import { act, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Router } from 'wouter';
import { memoryLocation } from 'wouter/memory-location';
import App from './App.jsx';
import { copy as footerCopy } from './components/siteFooterCopy.js';
import election from './config/election.js';
import referrals from './config/referrals.js';
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
  // jsdom does not implement scrolling.
  vi.stubGlobal('scrollTo', vi.fn());
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

  it('renders the early voting wait times page at /early-voting', async () => {
    renderAt('/early-voting');

    expect(await screen.findByRole('heading', { level: 1 })).toHaveTextContent(
      'Early voting wait times',
    );
  });

  it('opens the wait times page from the home page without a full reload', async () => {
    const user = userEvent.setup();
    const location = renderAt('/');
    await user.click(screen.getByRole('link', { name: 'See early voting wait times' }));
    expect(location.history.at(-1)).toBe('/early-voting');
    expect(await screen.findByRole('heading', { level: 1 })).toHaveTextContent(
      'Early voting wait times',
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

  it.each(['/', '/p/CC007', '/learn', '/learn/voter-id', '/privacy', '/nope'])(
    'says in the footer that the site is nonpartisan and unofficial, with both boards linked, on %s',
    (path) => {
      renderAt(path);

      const footer = screen.getByRole('contentinfo');
      expect(footer).toHaveTextContent(footerCopy.statement);
      expect(footer).toHaveTextContent(/nonpartisan/i);
      expect(footer).toHaveTextContent(/unofficial/i);
      expect(within(footer).getByRole('link', { name: footerCopy.countySite })).toHaveAttribute(
        'href',
        election.countySiteUrl,
      );
      expect(within(footer).getByRole('link', { name: footerCopy.citySite })).toHaveAttribute(
        'href',
        referrals.stlCityBoard.url,
      );
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

  it('starts every page with a skip link to main', async () => {
    renderAt('/p/CC007');

    await userEvent.tab();

    const skip = screen.getByRole('link', { name: 'Skip to main content' });
    expect(skip).toHaveFocus();
    expect(skip).toHaveAttribute('href', '#main');
    const main = screen.getByRole('main');
    expect(main).toHaveAttribute('id', 'main');
    expect(main).toHaveAttribute('tabindex', '-1');
  });

  it('leaves focus alone on the first load of the home page', () => {
    renderAt('/');

    expect(document.body).toHaveFocus();
    expect(window.scrollTo).not.toHaveBeenCalled();
  });

  it.each([
    ['/privacy', 'Back to home'],
    ['/nope', /home page/i],
  ])(
    'moves focus to the heading and scrolls to the top after going home from %s',
    async (path, name) => {
      renderAt(path);
      window.scrollTo.mockClear();

      await userEvent.click(screen.getByRole('link', { name }));

      expect(heading()).toHaveTextContent('St. Louis County Voter Guide');
      expect(heading()).toHaveFocus();
      expect(window.scrollTo).toHaveBeenCalledWith(0, 0);
    },
  );

  it('moves focus to the not-found heading after an in-app link to a missing page', async () => {
    const location = renderAt('/');

    location.navigate('/missing');
    await screen.findByText('Page not found');

    expect(heading()).toHaveFocus();
  });

  it('moves focus to the heading when a click left focus on main, as Safari does', async () => {
    // WebKit does not focus a clicked link: focus goes to the nearest focusable
    // ancestor, which is main.
    const location = renderAt('/privacy');
    screen.getByRole('main').focus();

    act(() => location.navigate('/'));

    expect(heading()).toHaveTextContent('St. Louis County Voter Guide');
    expect(heading()).toHaveFocus();
  });

  it('keeps the browser scroll position on Back and Forward', () => {
    const location = renderAt('/privacy');
    window.scrollTo.mockClear();

    act(() => {
      window.dispatchEvent(new PopStateEvent('popstate'));
      location.navigate('/');
    });

    expect(heading()).toHaveTextContent('St. Louis County Voter Guide');
    expect(window.scrollTo).not.toHaveBeenCalled();
    expect(heading()).toHaveFocus();
  });

  it('still scrolls to the top after the skip link fired popstate on the old page', () => {
    // Following a hash link fires popstate without leaving the page.
    window.history.replaceState(null, '', '/privacy');
    const location = renderAt('/privacy');
    act(() => window.dispatchEvent(new PopStateEvent('popstate')));
    window.history.replaceState(null, '', '/');
    window.scrollTo.mockClear();

    act(() => location.navigate('/'));

    expect(window.scrollTo).toHaveBeenCalledWith(0, 0);
  });

  it('keeps the scroll position on Back to a path with an escaped character', () => {
    const location = renderAt('/');
    window.history.replaceState(null, '', '/no%20such');
    window.scrollTo.mockClear();

    act(() => {
      window.dispatchEvent(new PopStateEvent('popstate'));
      location.navigate('/no such');
    });
    window.history.replaceState(null, '', '/');

    expect(heading()).toHaveTextContent('Page not found');
    expect(window.scrollTo).not.toHaveBeenCalled();
  });

  it('leaves focus where a page put it after navigating', async () => {
    renderAt('/');

    await userEvent.click(
      within(screen.getByRole('contentinfo')).getByRole('link', { name: 'Privacy' }),
    );

    // The privacy page focuses its own heading; the app does not move it again.
    expect(heading()).toHaveTextContent('Privacy');
    expect(heading()).toHaveFocus();
  });

  it.each([
    ['/privacy', 'Privacy | St. Louis County Voter Guide'],
    ['/nope', 'Page not found | St. Louis County Voter Guide'],
  ])('titles %s and restores the old title on leaving', (path, title) => {
    document.title = 'St. Louis County Voter Guide';
    const { unmount } = render(
      <Router hook={memoryLocation({ path }).hook}>
        <App />
      </Router>,
    );

    expect(document.title).toBe(title);
    unmount();
    expect(document.title).toBe('St. Louis County Voter Guide');
  });

  it('navigates home from the not-found page without a full reload', async () => {
    const location = renderAt('/nope');

    await userEvent.click(screen.getByRole('link', { name: /home page/i }));

    expect(location.history).toEqual(['/nope', '/']);
    expect(heading()).toHaveTextContent('St. Louis County Voter Guide');
  });
});
