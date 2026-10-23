import { Link, useLocation } from 'wouter';
import { normalizePath } from '../pageHead.js';
import SiteMark from './SiteMark.jsx';
import { copy } from './siteHeaderCopy.js';

// Local styling until the shared components of #78.
const navLink =
  'inline-flex min-h-11 items-center px-1 text-primary underline-offset-4 hover:underline aria-[current=page]:font-semibold aria-[current=page]:underline';

/**
 * On every page, above main (#79): the site name, which links home, and the
 * two places a voter comes back to. One row at 360 px: 53 px tall with its
 * rule while the name fits on one line, at most 56 with wider text spacing,
 * so it is never the largest thing on screen (#27). Not sticky, so it costs
 * no room on a small phone once scrolled past, and not printed. "Look up"
 * shows from the sm breakpoint up: at 360 px it does not fit on the row with
 * wider text spacing, and the site name already links home.
 */
export default function SiteHeader() {
  const [location] = useLocation();
  // As the routes match: a trailing slash or other case is the same page.
  // The pre-rendered /learn page also hydrates at /learn/ (#99), so this
  // must agree with the server's render there.
  const here = normalizePath(location).toLowerCase();
  const current = (path) => (here === path ? 'page' : undefined);
  return (
    <header className="border-b border-border print:hidden" data-site-header="">
      <div className="mx-auto flex min-h-13 w-full max-w-2xl items-center justify-between gap-x-4 px-4">
        <Link
          href="/"
          className="inline-flex min-h-11 min-w-0 items-center gap-2 font-semibold text-ink"
        >
          <SiteMark className="size-6 shrink-0 text-primary" />
          <span>{copy.siteName}</span>
        </Link>
        <nav aria-label={copy.nav}>
          <ul className="flex items-center gap-x-3 text-sm">
            <li className="hidden sm:block">
              <Link href="/" className={navLink} aria-current={current('/')}>
                {copy.lookUp}
              </Link>
            </li>
            <li>
              <Link href="/learn" className={navLink} aria-current={current('/learn')}>
                {copy.howToVote}
              </Link>
            </li>
          </ul>
        </nav>
      </div>
    </header>
  );
}
