// The words the error states share (#18). The text is in src/i18n/en.json (#19).
import { translated } from '../../i18n/index.js';

export const copy = translated((t) => ({
  retry: t('retry.retry'),
  retrying: t('retry.retrying'),
  // Shown, and announced, after a lookup or a page has waited SLOW_MS.
  slow: t('retry.slow'),
}));

/** Whether the browser says it has no network connection. */
export function isOffline() {
  return globalThis.navigator?.onLine === false;
}
