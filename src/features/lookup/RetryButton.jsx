import { copy } from './errorCopy.js';

/**
 * The "Try again" button of an error message (#18). It stays in place while
 * the retry runs, marked busy, so the focus on it is never lost; a second
 * press while busy does nothing.
 * @param {{ onRetry: () => void, busy?: boolean, className?: string }} props
 */
export default function RetryButton({ onRetry, busy = false, className = '' }) {
  return (
    <button
      type="button"
      onClick={() => {
        if (!busy) onRetry();
      }}
      aria-disabled={busy || undefined}
      className={`min-h-11 rounded-md border border-primary px-4 py-2 font-semibold text-primary aria-disabled:cursor-wait aria-disabled:opacity-70 ${className}`}
    >
      {busy ? copy.retrying : copy.retry}
    </button>
  );
}
