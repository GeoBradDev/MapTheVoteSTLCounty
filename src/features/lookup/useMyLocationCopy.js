// All the "Use my location" text. The text is in src/i18n/en.json (#19).
// `privacy` is the one line under the search for the address too, and
// `notHome` shows only after a Use my location result (#216).
import { translated } from '../../i18n/index.js';

export const copy = translated((t) => ({
  button: t('useMyLocation.button'),
  busy: t('useMyLocation.busy'),
  privacy: t('useMyLocation.privacy'),
  notHome: t('useMyLocation.notHome'),
  errors: {
    denied: t('useMyLocation.errors.denied'),
    timeout: t('useMyLocation.errors.timeout'),
    unavailable: t('useMyLocation.errors.unavailable'),
    insecure: t('useMyLocation.errors.insecure'),
    unsupported: t('useMyLocation.errors.unsupported'),
    coarse: t('useMyLocation.errors.coarse'),
  },
}));
