import { act, render, screen } from '@testing-library/react';
import ErrorBoundary from '../../components/ErrorBoundary.jsx';
import userEvent from '@testing-library/user-event';
import { Route, Router } from 'wouter';
import { memoryLocation } from 'wouter/memory-location';
import { learnCopy } from './learnCopy.js';
import LearnTopicPage from './LearnTopicPage.jsx';

// The fixtures carry their bodies, so they count as loaded. `slow` is only a
// summary, as the first load has (#147): its body comes from `body.load`.
const body = vi.hoisted(() => ({ load: null, lookups: null }));
vi.mock('./topics.js', async (importOriginal) => {
  const actual = await importOriginal();
  const { fixtureTopics: topics } = await import('../../test/learnFixtures.js');
  const slow = { id: 'slow', locale: 'en', title: 'Fixture slow topic', group: 'get-help' };
  // A translation of voter-id whose body is not loaded yet.
  const translated = { id: 'voter-id', locale: 'es', title: 'Fixture ID topic', group: 'get-help' };
  const make = () =>
    actual.topicLookups(
      actual.indexTopics([...topics, slow, translated]),
      new Map([
        ['en/slow', () => body.load()],
        ['es/voter-id', () => body.load()],
      ]),
    );
  body.reset = () => {
    body.lookups = make();
  };
  body.reset();
  return {
    ...actual,
    getTopic: (id, locale) => body.lookups.getTopic(id, body.locale ?? locale),
    loadedTopic: (topic) => body.lookups.loadedTopic(topic),
    loadTopic: (topic) => body.lookups.loadTopic(topic),
  };
});

beforeEach(() => {
  body.reset();
  body.locale = null;
});

const copy = learnCopy.en;

function renderTopic(id) {
  const location = memoryLocation({ path: `/learn/${id}`, record: true });
  const view = render(
    <Router hook={location.hook}>
      <Route path="/learn/:topic" component={LearnTopicPage} />
    </Router>,
  );
  return { location, ...view };
}

afterEach(() => {
  document.title = 'St. Louis County Voter Guide';
});

describe('LearnTopicPage', () => {
  it('renders the topic with its sources and last checked date', () => {
    renderTopic('voter-id');
    expect(screen.getByRole('heading', { level: 1, name: 'Fixture ID topic' })).toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Sources' })).toBeInTheDocument();
    expect(screen.getByText(/^Last checked against these sources on/)).toBeInTheDocument();
  });

  it('names the tab after the topic and moves focus to its title', () => {
    renderTopic('voter-id');
    expect(document.title).toBe(copy.pageTitle('Fixture ID topic'));
    expect(screen.getByRole('heading', { level: 1 })).toHaveFocus();
  });

  it('links back to all topics', async () => {
    const { location } = renderTopic('voter-id');
    await userEvent.click(screen.getByRole('link', { name: copy.allTopics }));
    expect(location.history.at(-1)).toBe('/learn');
  });

  it('shows the not-found page for an unknown topic', () => {
    renderTopic('no-such-topic');
    expect(screen.getByRole('heading', { level: 1, name: 'Page not found' })).toBeInTheDocument();
    // The not-found page's own title (#26), never the unknown id.
    expect(document.title).toBe('Page not found | St. Louis County Voter Guide');
  });

  it('opens every folded section before printing', () => {
    const { container } = renderTopic('at-polls');
    const details = container.querySelector('details');
    expect(details.open).toBe(false);
    act(() => {
      window.dispatchEvent(new Event('beforeprint'));
    });
    expect(details.open).toBe(true);
  });

  it('stops listening for print when it unmounts', () => {
    const remove = vi.spyOn(window, 'removeEventListener');
    const { unmount } = renderTopic('at-polls');
    unmount();
    expect(remove).toHaveBeenCalledWith('beforeprint', expect.any(Function));
    remove.mockRestore();
  });

  it('closes again after printing the sections it opened, and only those', () => {
    const { container } = renderTopic('at-polls');
    const details = container.querySelector('details');
    act(() => {
      window.dispatchEvent(new Event('beforeprint'));
    });
    act(() => {
      window.dispatchEvent(new Event('afterprint'));
    });
    expect(details.open).toBe(false);

    details.open = true;
    act(() => {
      window.dispatchEvent(new Event('beforeprint'));
      window.dispatchEvent(new Event('afterprint'));
    });
    expect(details.open).toBe(true);
  });

  it('starts the next topic fresh: folded, titled and focused', async () => {
    const location = memoryLocation({ path: '/learn/at-polls', record: true });
    const { container } = render(
      <Router hook={location.hook}>
        <Route path="/learn/:topic" component={LearnTopicPage} />
      </Router>,
    );
    container.querySelector('details').open = true;
    screen.getByRole('heading', { level: 1 }).blur();
    act(() => location.navigate('/learn/second-long'));
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(
      'Fixture second long topic',
    );
    expect(container.querySelector('details').open).toBe(false);
    expect(screen.getByRole('heading', { level: 1 })).toHaveFocus();
  });

  // The body loads with the page (#147): a placeholder holds the page's height
  // meanwhile, so the footer does not show and then jump down.
  describe('while the body loads', () => {
    async function slowBody() {
      const { fixtureTopics } = await import('../../test/learnFixtures.js');
      const fixture = fixtureTopics.find((t) => t.id === 'voter-id');
      return { ...fixture, id: 'slow', title: 'Fixture slow topic' };
    }

    it('holds the page height, then shows the topic with focus on its title', async () => {
      let resolve;
      body.load = () => new Promise((r) => (resolve = r));
      const { container } = renderTopic('slow');
      expect(screen.queryByRole('heading', { level: 1 })).toBeNull();
      expect(container.querySelector('.min-h-screen')).not.toBeNull();
      await act(async () => resolve(await slowBody()));
      expect(screen.getByRole('heading', { level: 1, name: 'Fixture slow topic' })).toHaveFocus();
      expect(screen.getByRole('region', { name: 'Sources' })).toBeInTheDocument();
      expect(document.title).toBe(copy.pageTitle('Fixture slow topic'));
    });

    // A new language is not a new page (#19): the topic stays, and focus stays
    // where the voter left it, while the translation's body loads.
    it('keeps the topic and focus while a translation loads', async () => {
      let resolve;
      body.load = () => new Promise((r) => (resolve = r));
      const { rerender, location } = renderTopic('voter-id');
      const heading = screen.getByRole('heading', { level: 1 });
      heading.blur();
      body.locale = 'es';
      rerender(
        <Router hook={location.hook}>
          <Route path="/learn/:topic" component={LearnTopicPage} />
        </Router>,
      );
      expect(screen.getByRole('heading', { level: 1 })).not.toHaveFocus();
      expect(screen.getByRole('region', { name: 'Sources' })).toBeInTheDocument();
      const { fixtureTopics } = await import('../../test/learnFixtures.js');
      const fixture = fixtureTopics.find((t) => t.id === 'voter-id');
      await act(async () => resolve({ ...fixture, locale: 'es', title: 'Fixture ID topic es' }));
      expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Fixture ID topic es');
      expect(screen.getByRole('heading', { level: 1 })).not.toHaveFocus();
    });

    it('shows the error screen when the body cannot load', async () => {
      body.load = () => Promise.reject(new Error('offline'));
      const error = vi.spyOn(console, 'error').mockImplementation(() => {});
      const location = memoryLocation({ path: '/learn/slow' });
      render(
        <Router hook={location.hook}>
          <ErrorBoundary>
            <Route path="/learn/:topic" component={LearnTopicPage} />
          </ErrorBoundary>
        </Router>,
      );
      expect(
        await screen.findByRole('heading', { level: 1, name: 'Something went wrong' }),
      ).toBeInTheDocument();
      error.mockRestore();
    });
  });
});
