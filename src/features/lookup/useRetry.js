import { useCallback, useLayoutEffect, useRef, useState } from 'react';

/**
 * A load that the voter can retry (#18). `attempt` goes in the loading
 * effect's dependencies, and the effect calls `done` when it settles. While a
 * retry runs, `loading` keeps the retry button in place (busy), so focus stays
 * on it; when a retry succeeds and the button goes away, focus moves to
 * `targetRef` instead of falling back to the page.
 * @returns {{ attempt: number, loading: boolean, retry: () => void,
 *   done: () => void, targetRef: { current: HTMLElement | null } }}
 */
export function useRetry() {
  const [attempt, setAttempt] = useState(0);
  const [loading, setLoading] = useState(true);
  const targetRef = useRef(null);
  const retriedRef = useRef(false);

  const retry = useCallback(() => {
    if (loading) return;
    retriedRef.current = true;
    setLoading(true);
    setAttempt((n) => n + 1);
  }, [loading]);

  const done = useCallback(() => setLoading(false), []);

  // A layout effect, so focus moves in the same commit that removes the button.
  useLayoutEffect(() => {
    if (loading || !retriedRef.current) return;
    retriedRef.current = false;
    const focused = document.activeElement;
    if (!focused || focused === document.body) targetRef.current?.focus();
  }, [loading]);

  return { attempt, loading, retry, done, targetRef };
}
