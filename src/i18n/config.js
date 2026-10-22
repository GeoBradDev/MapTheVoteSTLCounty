// The languages the site offers (#19). To add one, put its messages in
// src/i18n/<code>.json, with the same keys as en.json, and add one line here.
// A key missing from a language falls back to English. `label` is the language's
// own name, as the language switcher shows it; `intl` is the tag dates and
// plurals are formatted with.

/** @type {Record<string, { label: string, intl: string }>} */
export const LOCALES = {
  en: { label: 'English', intl: 'en-US' },
};

/** The language every message must exist in, and the one the site starts in. */
export const DEFAULT_LOCALE = 'en';

/** Every date and time the site shows is in the election's time zone. */
export const TIME_ZONE = 'America/Chicago';
