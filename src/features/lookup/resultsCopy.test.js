import election from '../../config/election.js';
import { copy, sourceName } from './resultsCopy.js';

describe('sourceName', () => {
  // The board's website moved to the county's site (#73); a source there must
  // read as the board, not as a bare host.
  it("names the county board's website as the board", () => {
    expect(sourceName(election.countySiteUrl)).toBe('St. Louis County Board of Elections');
  });

  it("names the board's ArcGIS apps as the board", () => {
    expect(sourceName(election.earlyVoting.sources[0])).toBe('St. Louis County Board of Elections');
  });

  it('names Missouri law, falls back to the host, and to "Source" for a bad URL', () => {
    expect(sourceName(election.electionDayHours.sources[0])).toBe('Missouri law');
    expect(sourceName('https://example.gov/page')).toBe('example.gov');
    expect(sourceName('not a url')).toBe(copy.polls.source);
  });
});
