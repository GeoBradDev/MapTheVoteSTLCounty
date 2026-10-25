import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { Router } from 'wouter';
import { memoryLocation } from 'wouter/memory-location';
import App from '../App.jsx';
import { LOCALES } from './config.js';
import { addMessages, setLocale } from './index.js';
import { unmountThenUnstub } from '../test/teardown.js';

vi.mock('../features/learn/topics.js', async (importOriginal) => {
  const actual = await importOriginal();
  const { fixtureTopics } = await import('../test/learnFixtures.js');
  return { ...actual, ...actual.topicLookups(actual.indexTopics(fixtureTopics)) };
});

beforeEach(() => {
  vi.stubGlobal('scrollTo', vi.fn());
  LOCALES.xx = { label: 'Stand-in', intl: 'fr' };
  addMessages('xx', {
    app: { skipLink: 'XX skip' },
    site: { pageTitle: '{name} | XX guide' },
    learn: { pageHeading: 'XX how', pageTitle: '{name} | XX guide' },
  });
});

afterEach(async () => {
  await act(() => setLocale('en'));
  delete LOCALES.xx;
  await unmountThenUnstub();
});

it('redraws the page in a new language without remounting it or moving focus', async () => {
  const location = memoryLocation({ path: '/learn' });
  render(
    <Router hook={location.hook}>
      <App />
    </Router>,
  );
  const h1 = screen.getByRole('heading', { level: 1, name: 'How to vote' });
  const select = screen.getByRole('combobox', { name: 'Language' });
  await userEvent.selectOptions(select, 'xx');

  expect(screen.getByRole('heading', { level: 1 })).toBe(h1);
  expect(h1).toHaveTextContent('XX how');
  expect(screen.getByRole('link', { name: 'XX skip' })).toBeInTheDocument();
  expect(select).toHaveFocus();
  expect(document.documentElement.lang).toBe('xx');
  expect(document.title).toBe('XX how | XX guide');
});

it.each([
  ['/learn/voter-id', 'Fixture ID topic | XX guide'],
  ['/privacy', 'Privacy | XX guide'],
])('keeps focus and retitles %s in a new language', async (path, title) => {
  const location = memoryLocation({ path });
  render(
    <Router hook={location.hook}>
      <App />
    </Router>,
  );
  const select = screen.getByRole('combobox', { name: 'Language' });
  await userEvent.selectOptions(select, 'xx');
  expect(select).toHaveFocus();
  expect(document.title).toBe(title);
});
