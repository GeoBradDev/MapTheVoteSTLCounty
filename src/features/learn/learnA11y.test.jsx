// The "How to vote" pages pass axe (#23): the index with no topics, the index
// with fixture topics, and every fixture topic page, rendered in the whole app
// (main landmark, footer). jsdom has no layout, so axe cannot measure color
// contrast here; it reports that check as incomplete, not passed. Check
// contrast in a real browser.
import { render, screen } from '@testing-library/react';
import axe from 'axe-core';
import { Router } from 'wouter';
import { memoryLocation } from 'wouter/memory-location';
import App from '../../App.jsx';
import { fixtureTopics } from '../../test/learnFixtures.js';

const shown = vi.hoisted(() => ({ topics: [] }));

vi.mock('./topics.js', async (importOriginal) => {
  const actual = await importOriginal();
  const lookups = () => actual.topicLookups(actual.indexTopics(shown.topics));
  return {
    ...actual,
    getTopics: (locale) => lookups().getTopics(locale),
    getTopic: (id, locale) => lookups().getTopic(id, locale),
  };
});

// As index.html sets them.
beforeAll(() => {
  document.documentElement.lang = 'en';
  document.title = 'St. Louis County Voter Guide';
});

afterEach(() => {
  shown.topics = [];
});

async function violations(path) {
  render(
    <Router hook={memoryLocation({ path }).hook}>
      <App />
    </Router>,
  );
  await screen.findByRole('heading', { level: 1 });
  const results = await axe.run(document, { resultTypes: ['violations'] });
  return results.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.html).join(' | ')}`);
}

describe('axe on the How to vote pages', () => {
  it('finds no violations on the index with no topics', async () => {
    expect(await violations('/learn')).toEqual([]);
  });

  it('finds no violations on the index with topics', async () => {
    shown.topics = fixtureTopics;
    expect(await violations('/learn')).toEqual([]);
  });

  it.each(fixtureTopics.map((t) => [t.id]))('finds no violations on /learn/%s', async (id) => {
    shown.topics = fixtureTopics;
    expect(await violations(`/learn/${id}`)).toEqual([]);
  });

  it('includes a topic with a folded section', () => {
    // So the run above covers <details> and <summary>.
    expect(fixtureTopics.some((t) => t.id === 'at-polls')).toBe(true);
  });
});
