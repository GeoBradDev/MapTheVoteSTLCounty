import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Router } from 'wouter';
import { memoryLocation } from 'wouter/memory-location';
import election from '../../config/election.js';
import { fixtureTopics } from '../../test/learnFixtures.js';
import LearnPage from './LearnPage.jsx';
import { learnCopy } from './learnCopy.js';

const shown = vi.hoisted(() => ({ topics: [] }));

vi.mock('./topics.js', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    getTopics: (locale) => actual.topicLookups(actual.indexTopics(shown.topics)).getTopics(locale),
  };
});

const copy = learnCopy.en;

function renderPage() {
  const location = memoryLocation({ path: '/learn', record: true });
  render(
    <Router hook={location.hook}>
      <LearnPage />
    </Router>,
  );
  return location;
}

afterEach(() => {
  shown.topics = [];
  document.title = 'St. Louis County Voter Guide';
});

describe('LearnPage with no topics yet', () => {
  it('says the guides are not ready and points to the official board site', () => {
    renderPage();
    expect(screen.getByRole('heading', { level: 1, name: copy.pageHeading })).toBeInTheDocument();
    expect(screen.getByText(copy.empty.notReady, { exact: false })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: copy.empty.countySite })).toHaveAttribute(
      'href',
      election.countySiteUrl,
    );
    expect(screen.queryAllByRole('heading', { level: 2 })).toHaveLength(0);
  });

  it('links to the address lookup', async () => {
    const location = renderPage();
    await userEvent.click(screen.getByRole('link', { name: copy.lookup }));
    expect(location.history.at(-1)).toBe('/');
  });
});

describe('LearnPage with topics', () => {
  beforeEach(() => {
    shown.topics = fixtureTopics;
  });

  it('lists topics under their groups, in group order, by title within a group', () => {
    renderPage();
    const groups = screen.getAllByRole('heading', { level: 2 });
    expect(groups.map((h) => h.textContent)).toEqual([
      copy.groups['before-you-vote'],
      copy.groups['ways-to-vote'],
      copy.groups['at-the-polls'],
      copy.groups['get-help'],
    ]);
    const before = screen.getByRole('region', { name: copy.groups['before-you-vote'] });
    expect(
      within(before)
        .getAllByRole('link')
        .map((a) => [a.textContent, a.getAttribute('href')]),
    ).toEqual([
      ['A fixture registration topic', '/learn/register'],
      ['Fixture ID topic', '/learn/voter-id'],
    ]);
    expect(screen.queryByText(copy.empty.notReady, { exact: false })).toBeNull();
  });

  it('leaves out a group with no topics', () => {
    shown.topics = fixtureTopics.filter((t) => t.group !== 'ways-to-vote');
    renderPage();
    expect(screen.queryByRole('heading', { name: copy.groups['ways-to-vote'] })).toBeNull();
    expect(screen.getAllByRole('heading', { level: 2 })).toHaveLength(3);
  });

  it('opens a topic', async () => {
    const location = renderPage();
    await userEvent.click(screen.getByRole('link', { name: 'Fixture absentee topic' }));
    expect(location.history.at(-1)).toBe('/learn/absentee');
  });
});

describe('LearnPage arrival', () => {
  it('names the tab and moves focus to the heading', () => {
    renderPage();
    expect(document.title).toBe(copy.pageTitle(copy.pageHeading));
    expect(screen.getByRole('heading', { level: 1 })).toHaveFocus();
  });
});
