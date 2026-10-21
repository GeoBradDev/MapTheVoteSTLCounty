import { useEffect, useState } from 'react';

/** How long work may run before the screen says it is still working (#18). */
export const SLOW_MS = 3000;

/**
 * Whether the current piece of work has run for SLOW_MS. `run` names it:
 * null or undefined when nothing is running, and a new value (a counter) for
 * each new run, so a new run starts its own wait.
 * @param {unknown} run
 * @returns {boolean}
 */
export function useSlowNotice(run) {
  const [slowRun, setSlowRun] = useState(null);
  useEffect(() => {
    if (run === null || run === undefined) return undefined;
    const timer = setTimeout(() => setSlowRun(run), SLOW_MS);
    return () => clearTimeout(timer);
  }, [run]);
  return run !== null && run !== undefined && slowRun === run;
}
