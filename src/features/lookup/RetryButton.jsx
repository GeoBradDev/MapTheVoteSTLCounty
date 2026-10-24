import { track } from '../../analytics/index.js';
import Button from '../../components/Button.jsx';
import { copy } from './errorCopy.js';

/**
 * The "Try again" button of an error message (#18). It stays in place while
 * the retry runs, marked busy, so the focus on it is never lost; a second
 * press while busy does nothing. A press that retries is counted with `where`
 * (#70), a fixed label from the allowlist in src/analytics/ga.js.
 * @param {{ onRetry: () => void, where: string, busy?: boolean, className?: string }} props
 */
export default function RetryButton({ onRetry, where, busy = false, className = '' }) {
  return (
    <Button
      variant="secondary"
      onClick={() => {
        track('retry', { where });
        onRetry();
      }}
      busy={busy}
      className={className}
    >
      {busy ? copy.retrying : copy.retry}
    </Button>
  );
}
