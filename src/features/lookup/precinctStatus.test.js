// Fixtures are live responses recorded by scripts/record-fixtures.mjs.
// @vitest-environment node
import byId from '../../../docs/raw/fixtures/precinct-by-id.json';
import nonresidential from '../../../docs/raw/fixtures/precinct-nonresidential.json';
import { precinctStatus } from './precinctStatus.js';

const inElection = byId.features[0].attributes;
const nonres = nonresidential.features[0].attributes;

describe('precinctStatus', () => {
  it('shows no banner and the ballot card for an In Election precinct', () => {
    expect(precinctStatus(inElection)).toEqual({
      kind: 'in-election',
      message: null,
      showBallot: true,
    });
  });

  it("gives the county's message as plain text and hides the ballot for a Nonresidential Precinct", () => {
    const status = precinctStatus(nonres);
    expect(status.kind).toBe('nonresidential');
    expect(status.showBallot).toBe(false);
    expect(status.message).toBe(nonres.html);
    expect(status.message).toMatch(/^This precinct has no recognized residential addresses/);
  });

  it('gives no message for a Nonresidential Precinct whose field cannot be read safely', () => {
    for (const html of [
      null,
      '',
      '<script>x</script>',
      'Sample Ballot: <a href=https://example.org/x>x</a>',
    ]) {
      expect(precinctStatus({ ...nonres, html })).toEqual({
        kind: 'nonresidential',
        message: null,
        showBallot: false,
      });
    }
  });

  it('strips markup from the message', () => {
    const status = precinctStatus({
      ...nonres,
      html: 'No <b>residential</b> addresses.<br>Call us.',
    });
    expect(status.message).toBe('No residential addresses. Call us.');
  });

  it('hides the ballot for a Not In Election precinct', () => {
    expect(precinctStatus({ ...inElection, in_election: 'Not In Election' })).toEqual({
      kind: 'not-in-election',
      message: null,
      showBallot: false,
    });
  });

  it('matches the value whatever its case or spacing', () => {
    expect(precinctStatus({ in_election: '  not in  election ' }).kind).toBe('not-in-election');
    expect(precinctStatus({ in_election: 'IN ELECTION' }).kind).toBe('in-election');
  });

  it('calls any other value unknown and keeps the ballot card', () => {
    for (const value of [null, undefined, '', 'Pending', 42]) {
      expect(precinctStatus({ ...inElection, in_election: value })).toEqual({
        kind: 'unknown',
        message: null,
        showBallot: true,
      });
    }
  });

  it('handles a missing precinct', () => {
    expect(precinctStatus(undefined).kind).toBe('unknown');
  });
});
