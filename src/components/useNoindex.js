import { useLayoutEffect } from 'react';

/**
 * Keeps the page out of search while it is shown (#98): adds
 * `<meta name="robots" content="noindex">` to the head and takes it away when
 * the page goes. Precinct pages use it (owner decision on #98: their polling
 * places are right only for the current election, and a search snippet can
 * outlive a change), as do the not-found page and the error screen: the host
 * answers every unknown path with 200 and the shell, so without it a mistyped
 * or old link is a soft 404 that could be indexed. Link previews ignore it.
 *
 * It removes only the tag it added, never another, such as the one a PR
 * preview build puts in every page (src/features/learn/content/searchEngines.js).
 * A layout effect, like the page titles, so the tag is in the head in the same
 * commit as the page.
 */
export function useNoindex() {
  useLayoutEffect(() => {
    const tag = document.createElement('meta');
    tag.name = 'robots';
    tag.content = 'noindex';
    document.head.append(tag);
    return () => tag.remove();
  }, []);
}
