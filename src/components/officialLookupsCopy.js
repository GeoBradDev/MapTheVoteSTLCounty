// The two boards' lookups, linked together where no jurisdiction is known yet
// (#93). The text is in src/i18n/en.json (#19).
import { translated } from '../i18n/index.js';

export const copy = translated((t) => ({
  county: t('officialLookups.county'),
  or: t('officialLookups.or'),
  city: t('officialLookups.city'),
}));
