import { useId } from 'react';
import { LOCALES } from './config.js';
import { setLocale, t, useLocale } from './index.js';

/**
 * Lets a voter pick the site's language (#19). It renders nothing while
 * src/i18n/config.js lists only one language, so it appears on its own once
 * a second one is added.
 */
export default function LanguageSwitcher() {
  const locale = useLocale();
  const id = useId();
  const codes = Object.keys(LOCALES);
  if (codes.length < 2) return null;
  return (
    <div className="mx-auto w-full max-w-2xl px-4 py-2 text-sm print:hidden">
      <label htmlFor={id} className="mr-2">
        {t('app.language')}
      </label>
      <select
        id={id}
        value={locale}
        onChange={(event) => {
          // A language file that fails to load (offline) leaves the site in
          // its current language, which the select goes back to showing.
          setLocale(event.target.value).catch(() => {});
        }}
        className="min-h-11 rounded-md border border-ink bg-surface px-2 text-ink"
      >
        {codes.map((code) => (
          <option key={code} value={code} lang={code}>
            {LOCALES[code].label}
          </option>
        ))}
      </select>
    </div>
  );
}
