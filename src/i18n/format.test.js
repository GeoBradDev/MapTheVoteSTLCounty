import { describe, expect, it } from 'vitest';
import { formatMessage } from './format.js';

describe('formatMessage', () => {
  it('returns plain text as is', () => {
    expect(formatMessage("The county's official lookup.", {}, 'en-US')).toBe(
      "The county's official lookup.",
    );
  });

  it('fills in {name} placeholders', () => {
    expect(formatMessage('Precinct {code} of {total}', { code: 'CC007', total: 3 }, 'en-US')).toBe(
      'Precinct CC007 of 3',
    );
  });

  it('leaves a placeholder with no value in place, so a missing value shows', () => {
    expect(formatMessage('Precinct {code}', {}, 'en-US')).toBe('Precinct {code}');
  });

  it('picks a plural branch with the locale plural rules, # being the count', () => {
    const message = '{n, plural, one {# suggestion} other {# suggestions}}. Use the arrows.';
    expect(formatMessage(message, { n: 1 }, 'en-US')).toBe('1 suggestion. Use the arrows.');
    expect(formatMessage(message, { n: 0 }, 'en-US')).toBe('0 suggestions. Use the arrows.');
    expect(formatMessage(message, { n: 4 }, 'en-US')).toBe('4 suggestions. Use the arrows.');
  });

  it('prefers an exact =N branch, and fills placeholders inside a branch', () => {
    const message =
      '{n, plural, =0 {None near {place}} one {One near {place}} other {# near {place}}}';
    expect(formatMessage(message, { n: 0, place: 'Clayton' }, 'en-US')).toBe('None near Clayton');
    expect(formatMessage(message, { n: 1, place: 'Clayton' }, 'en-US')).toBe('One near Clayton');
    expect(formatMessage(message, { n: 7, place: 'Clayton' }, 'en-US')).toBe('7 near Clayton');
  });

  it('uses the plural rules of the locale given', () => {
    // French puts 0 and 1 in "one"; English puts 0 in "other".
    const message = '{n, plural, one {singular} other {plural}}';
    expect(formatMessage(message, { n: 0 }, 'fr')).toBe('singular');
    expect(formatMessage(message, { n: 0 }, 'en-US')).toBe('plural');
  });

  it('falls back to the other branch', () => {
    expect(formatMessage('{n, plural, other {# items}}', { n: 1 }, 'en-US')).toBe('1 items');
  });

  it('does not treat # outside a plural as the count', () => {
    expect(formatMessage('Room #{n}', { n: 2 }, 'en-US')).toBe('Room #2');
  });
});
