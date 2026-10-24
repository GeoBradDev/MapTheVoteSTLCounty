// The lookup's own messages. The text is in src/i18n/en.json (#19). Each error
// is followed by links to both boards' official lookups (#93).
import { translated } from '../../i18n/index.js';

export const copy = translated((t) => ({
  errorAfterLink: t('lookup.errorAfterLink'),
  // A lookup that could not finish (#18) never says the address was not
  // found: only noMatch does, when the sources that answered had no single
  // answer (README, Errors).
  errors: {
    noMatch: t('lookup.errors.noMatch'),
    unavailable: t('lookup.errors.unavailable'),
    failed: t('lookup.errors.failed'),
    offline: t('lookup.errors.offline'),
  },
  // The credit under the address search, after "Use my location" (#80),
  // folded under `summary` (#216). The
  // service and data names and links come from the geocoder module
  // (attribution in src/data/geocoder.js).
  attribution: {
    searchBy: t('lookup.attribution.searchBy'),
    then: t('lookup.attribution.then'),
    by: t('lookup.attribution.by'),
    data: t('lookup.attribution.data'),
    cityCheck: t('lookup.attribution.cityCheck'),
    privacy: t('lookup.attribution.privacy'),
    summary: t('lookup.attribution.summary'),
    privacyBefore: t('lookup.attribution.privacyBefore'),
    privacyLink: t('lookup.attribution.privacyLink'),
  },
}));
