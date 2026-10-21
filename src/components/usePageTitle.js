import { useEffect } from 'react';

const SITE_NAME = 'St. Louis County Voter Guide';

/**
 * Sets the tab title to "<name> | St. Louis County Voter Guide" while the page
 * is shown, and puts the old title back when it goes, so each page has its own
 * title (WCAG 2.4.2).
 * @param {string} name The page's own name, usually its heading.
 */
export function usePageTitle(name) {
  useEffect(() => {
    const previous = document.title;
    document.title = `${name} | ${SITE_NAME}`;
    return () => {
      document.title = previous;
    };
  }, [name]);
}
