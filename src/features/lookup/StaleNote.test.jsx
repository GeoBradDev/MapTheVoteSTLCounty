// Dates are built from the config, never ISO literals: the hardcoding test
// scans this file.
import { act, render, screen } from '@testing-library/react';
import election from '../../config/election.js';
import { copy } from './resultsCopy.js';
import StaleNote from './StaleNote.jsx';

const MINUTE = 60_000;
// 11:50 p.m. in Chicago (UTC-6) on the day before Election Day.
const [year, month, day] = election.electionDate.split('-').map(Number);
const loadedAt = Date.UTC(year, month - 1, day, 5, 50);
const loadedOn = new Date(Date.UTC(year, month - 1, day - 1)).toISOString().slice(0, 10);

afterEach(() => {
  vi.useRealTimers();
});

describe('StaleNote', () => {
  it('gives the time only when the list loaded today', () => {
    vi.useFakeTimers();
    vi.setSystemTime(loadedAt + 5 * MINUTE);
    render(<StaleNote loadedAt={loadedAt} />);
    expect(screen.getByRole('status')).toHaveTextContent(copy.polls.staleNote('23:50', null));
  });

  it('names the day once midnight passes while it is shown', () => {
    vi.useFakeTimers();
    vi.setSystemTime(loadedAt + 5 * MINUTE);
    render(<StaleNote loadedAt={loadedAt} />);
    act(() => vi.advanceTimersByTime(10 * MINUTE));
    expect(screen.getByRole('status')).toHaveTextContent(copy.polls.staleNote('23:50', loadedOn));
  });
});
