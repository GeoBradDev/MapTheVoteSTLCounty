// Whether early voting has started, is running or has ended (#104).
// Dates are a year early: the election's own dates live only in the config.
import { earlyVotingSeason } from './earlyVotingSeason.js';

const TZ = 'America/Chicago';
const SCHEDULES = {
  boe: [{ from: '2025-09-22', to: '2025-10-30', days: 'weekdays', open: '08:00', close: '16:30' }],
  abs: [
    { from: '2025-10-20', to: '2025-10-30', days: 'weekdays', open: '08:00', close: '16:30' },
    { from: '2025-11-02', to: '2025-11-02', days: 'daily', open: '08:00', close: '17:00' },
  ],
};
// Noon Central on a date.
const noon = (date) => new Date(`${date}T17:00:00Z`);

describe('earlyVotingSeason', () => {
  it('is before, with the first and last dates, until the first site opens', () => {
    expect(earlyVotingSeason(SCHEDULES, noon('2025-09-21'), TZ)).toEqual({
      kind: 'before',
      from: '2025-09-22',
      to: '2025-11-02',
    });
  });

  it('is during from the first date through the last', () => {
    expect(earlyVotingSeason(SCHEDULES, noon('2025-09-22'), TZ).kind).toBe('during');
    // A day with no site open is still during.
    expect(earlyVotingSeason(SCHEDULES, noon('2025-10-31'), TZ).kind).toBe('during');
    expect(earlyVotingSeason(SCHEDULES, noon('2025-11-02'), TZ).kind).toBe('during');
  });

  it('is ended once the last site closed for good', () => {
    // 5:00 p.m. Central (CST) on the last day.
    expect(earlyVotingSeason(SCHEDULES, new Date('2025-11-02T23:00:00Z'), TZ).kind).toBe('ended');
    expect(earlyVotingSeason(SCHEDULES, noon('2025-11-03'), TZ).kind).toBe('ended');
  });

  it('is ended with no schedule at all', () => {
    expect(earlyVotingSeason({}, noon('2025-10-22'), TZ).kind).toBe('ended');
  });
});
