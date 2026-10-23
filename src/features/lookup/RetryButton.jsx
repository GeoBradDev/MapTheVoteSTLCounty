import Button from '../../components/Button.jsx';
import { copy } from './errorCopy.js';

/**
 * The "Try again" button of an error message (#18). It stays in place while
 * the retry runs, marked busy, so the focus on it is never lost; a second
 * press while busy does nothing.
 * @param {{ onRetry: () => void, busy?: boolean, className?: string }} props
 */
export default function RetryButton({ onRetry, busy = false, className = '' }) {
  return (
    <Button variant="secondary" onClick={() => onRetry()} busy={busy} className={className}>
      {busy ? copy.retrying : copy.retry}
    </Button>
  );
}
