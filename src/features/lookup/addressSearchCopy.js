// All the address search text. The text is in src/i18n/en.json (#19).
import { translated } from '../../i18n/index.js';

export const copy = translated((t) => ({
  label: t('addressSearch.label'),
  hint: t('addressSearch.hint'),
  submit: t('addressSearch.submit'),
  busy: t('addressSearch.busy'),
  empty: t('addressSearch.empty'),
  suggestions: t('addressSearch.suggestions'),
  /** @param {number} n */
  suggestionCount: (n) => t('addressSearch.suggestionCount', { count: n }),
}));
