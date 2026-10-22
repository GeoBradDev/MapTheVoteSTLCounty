import { publicPaths } from './publicPages.js';

describe('publicPaths', () => {
  it('is the home page, /learn, each topic by id and /privacy', () => {
    expect(publicPaths(['voter-id', 'absentee'])).toEqual([
      '/',
      '/learn',
      '/learn/absentee',
      '/learn/voter-id',
      '/privacy',
    ]);
  });

  it('never lists a precinct page', () => {
    expect(publicPaths(['voter-id']).some((p) => p.startsWith('/p/'))).toBe(false);
  });
});
