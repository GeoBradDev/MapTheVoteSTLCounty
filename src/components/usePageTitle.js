import { useLayoutEffect } from 'react';
import { t, useLocale } from '../i18n/index.js';

/**
 * Sets the tab title to "<name> | St. Louis Voter Guide" while the page
 * is shown, and puts the old title back when it goes, so each page has its own
 * title (WCAG 2.4.2). A layout effect, like the precinct page's: on a
 * navigation React runs the old page's layout cleanups before the new page's
 * layout effects but its passive cleanups after them, so a passive restore
 * here would write this page's old title over the next page's (#128).
 * @param {string} name The page's own name, usually its heading.
 */
export function usePageTitle(name) {
  const locale = useLocale();
  useLayoutEffect(() => {
    const previous = document.title;
    document.title = t('site.pageTitle', { name });
    return () => {
      document.title = previous;
    };
  }, [name, locale]);
}
