import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Route, Router } from 'wouter';
import { memoryLocation } from 'wouter/memory-location';
import { fixtureTopics } from '../../test/learnFixtures.js';
import { learnCopy } from './learnCopy.js';
import LearnTopicPage from './LearnTopicPage.jsx';

vi.mock('./topics.js', async (importOriginal) => {
  const actual = await importOriginal();
  const { fixtureTopics: topics } = await import('../../test/learnFixtures.js');
  return {
    ...actual,
    getTopic: (id, locale) => actual.topicLookups(actual.indexTopics(topics)).getTopic(id, locale),
  };
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
    expect(document.title).toBe('St. Louis County Voter Guide');
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
});
