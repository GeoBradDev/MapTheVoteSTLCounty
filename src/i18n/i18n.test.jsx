import { act, render, screen } from '@testing-library/react';
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { LOCALES, TIME_ZONE } from './config.js';
import en from './en.json';
import {
  addMessages,
  formatCalendarDate,
  formatDate,
  formatNumber,
  getLocale,
  setLocale,
  t,
  translated,
} from './index.js';
import LanguageSwitcher from './LanguageSwitcher.jsx';

// A stand-in for a second language: what adding es.json and its line in
// config.js does, without shipping a translation.
function addStandIn() {
  LOCALES.xx = { label: 'Stand-in', intl: 'fr' };
  addMessages('xx', { home: { heading: 'XX heading' }, notFound: { heading: 'XX {missing}' } });
}

afterEach(async () => {
  await setLocale('en');
  delete LOCALES.xx;
});

describe('t', () => {
  it('reads a message by its dotted key and fills in its values', () => {
    expect(t('home.heading')).toBe('St. Louis Voter Guide');
    expect(t('results.precinct', { code: 'CC007' })).toBe('Precinct CC007');
  });

  it('returns the key for a message that does not exist, so it shows and fails tests', () => {
    expect(t('home.noSuchMessage')).toBe('home.noSuchMessage');
  });

  it('uses a second language once chosen, with English for any message it lacks', async () => {
    addStandIn();
    await setLocale('xx');
    expect(getLocale()).toBe('xx');
    expect(t('home.heading')).toBe('XX heading');
    expect(t('home.intro')).toBe(en.home.intro);
  });

  it('sets <html lang> to the language', async () => {
    addStandIn();
    await setLocale('xx');
    expect(document.documentElement.lang).toBe('xx');
    await setLocale('en');
    expect(document.documentElement.lang).toBe('en');
  });

  it('refuses a language that is not configured', async () => {
    await expect(setLocale('zz')).rejects.toThrow(/Unknown locale/);
    expect(getLocale()).toBe('en');
  });
});

describe('translated', () => {
  it('builds a copy object in the current language and keeps it until the language changes', async () => {
    const copy = translated((tr) => ({ heading: tr('home.heading'), keys: { a: 1 } }));
    expect(copy.heading).toBe('St. Louis Voter Guide');
    expect(copy.keys).toBe(copy.keys);
    expect(Object.keys(copy)).toEqual(['heading', 'keys']);
    addStandIn();
    await setLocale('xx');
    expect(copy.heading).toBe('XX heading');
  });
});

describe('dates', () => {
  it('formats in the election time zone, America/Chicago', () => {
    expect(TIME_ZONE).toBe('America/Chicago');
    // 03:30 UTC on March 3 is still March 2 in St. Louis.
    expect(formatDate(Date.UTC(2027, 2, 3, 3, 30), { month: 'long', day: 'numeric' })).toBe(
      'March 2',
    );
  });

  it('formats a calendar date as that day, whatever the time zone', () => {
    expect(formatCalendarDate('2027-03-02', { dateStyle: 'long' })).toBe('March 2, 2027');
    expect(formatCalendarDate('2027-03-02', { dateStyle: 'long', timeZone: 'UTC' })).toBe(
      'March 2, 2027',
    );
  });

  it('formats in the current language', async () => {
    addStandIn();
    await setLocale('xx');
    expect(formatCalendarDate('2027-03-02', { month: 'long' })).toBe('mars');
  });
});

describe('numbers', () => {
  it('formats a number for the current language', async () => {
    expect(formatNumber(1.5, { minimumFractionDigits: 1 })).toBe('1.5');
    addStandIn();
    await setLocale('xx');
    expect(formatNumber(1.5, { minimumFractionDigits: 1 })).toBe('1,5');
    expect(formatNumber(1.5, { minimumFractionDigits: 1 }, 'en')).toBe('1.5');
  });
});

describe('LanguageSwitcher', () => {
  it('shows nothing while there is one language', () => {
    const { container } = render(<LanguageSwitcher />);
    expect(container).toBeEmptyDOMElement();
  });

  it('shows the languages once a second one is configured, and switches', async () => {
    addStandIn();
    render(<LanguageSwitcher />);
    const select = screen.getByRole('combobox', { name: en.app.language });
    expect(screen.getByRole('option', { name: 'Stand-in' })).toBeInTheDocument();
    await act(async () => {
      select.value = 'xx';
      select.dispatchEvent(new Event('change', { bubbles: true }));
    });
    expect(getLocale()).toBe('xx');
  });
});

describe('en.json', () => {
  const root = path.resolve(import.meta.dirname, '..');
  const sources = (dir) =>
    readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) return sources(full);
      return /\.(js|jsx)$/.test(entry.name) && !/\.test\./.test(entry.name) ? [full] : [];
    });
  const lookup = (key) => key.split('.').reduce((node, part) => node?.[part], en);

  it('has every message the code asks for by a literal key', () => {
    const missing = [];
    let found = 0;
    for (const file of sources(root)) {
      const text = readFileSync(file, 'utf8');
      for (const [, key] of text.matchAll(/\bt\(\s*'([a-zA-Z][\w-]*(?:\.[\w-]+)+)'/g)) {
        found++;
        if (typeof lookup(key) !== 'string') missing.push(`${path.relative(root, file)}: ${key}`);
      }
    }
    expect(found).toBeGreaterThan(150);
    expect(missing).toEqual([]);
  });

  it('holds only strings, which every language file must match', () => {
    const leaves = (node) =>
      Object.values(node).flatMap((value) => (typeof value === 'object' ? leaves(value) : [value]));
    expect(leaves(en).every((value) => typeof value === 'string')).toBe(true);
  });
});
