import { lazy, Suspense, useEffect, useLayoutEffect, useRef } from 'react';
import { Route, Switch, useLocation } from 'wouter';
import ErrorBoundary from './components/ErrorBoundary.jsx';
import { cityOnPath } from './data/jurisdictions.js';
import NotFoundPage from './components/NotFoundPage.jsx';
import SiteFooter from './components/SiteFooter.jsx';
import LearnPage from './features/learn/LearnPage.jsx';
import LearnTopicPage from './features/learn/LearnTopicPage.jsx';
import HomePage from './features/lookup/HomePage.jsx';
import PrecinctPage from './features/lookup/PrecinctPage.jsx';
import PrivacyPage from './features/privacy/PrivacyPage.jsx';
import { t, useLocale } from './i18n/index.js';
import LanguageSwitcher from './i18n/LanguageSwitcher.jsx';
import { endHydration } from './hydrate.js';
import { applyHead, pageHead } from './pageHead.js';

// The wait times page (#104) loads on demand, so its code (the list, sorts
// and map) stays out of the first load's JavaScript budget (#27). The wait
// time loop itself is in the first load: the results page's early voting card
// reads it (#105).
const WaitTimesPage = lazy(() => import('./features/waitTimes/WaitTimesPage.jsx'));

// The path as wouter reports it: decoded with decodeURI, or as is when that fails.
function decodedPath() {
  const path = window.location.pathname;
  try {
    return decodeURI(path);
  } catch {
    return path;
  }
}

// The path the last Back or Forward went to. A path, not a flag, because
// following the skip link (a hash) fires popstate too, without a new page.
// The listener is added when this module loads, before wouter adds its own:
// the browser runs microtasks between popstate listeners, so wouter's update
// renders the new page and runs the effect below before any listener added
// after wouter's would run. The build's server render (#99) loads this module
// in Node, where there is no window and no history.
let poppedPath = null;
if (typeof window !== 'undefined') {
  window.addEventListener('popstate', () => {
    poppedPath = decodedPath();
  });
}

/**
 * After an in-app navigation (not the first load), starts the new page at the
 * top, and when the link that was followed went away with the old page,
 * leaving focus on the body (or on main, where Safari puts it after a click),
 * moves focus to the new page's heading so a screen reader announces it.
 * Pages that focus their own heading do it in their own effects, which run
 * first, so they are left alone; a page loaded on demand (the wait times
 * page, #104) mounts after this effect found no heading, and focuses its own
 * when it arrives. Back and Forward do not scroll to the top,
 * so the position the browser restores stays, unless the page itself focuses
 * its heading on arrival.
 */
function usePageArrival() {
  const [location] = useLocation();
  const previous = useRef(location);
  const first = useRef(location);

  // From the first in-app navigation on, pages focus their heading as usual
  // (src/hydrate.js). A layout effect, so it runs before the new page's own
  // (passive) focus effect.
  useLayoutEffect(() => {
    if (location !== first.current) endHydration();
  }, [location]);

  useEffect(() => {
    if (previous.current === location) return;
    const fromHistory = poppedPath === location;
    poppedPath = null;
    previous.current = location;
    if (!fromHistory) window.scrollTo(0, 0);
    const focused = document.activeElement;
    if (focused && focused !== document.body && focused.id !== 'main') return;
    document.querySelector('main h1[tabindex="-1"]')?.focus({ preventScroll: fromHistory });
  }, [location]);
}

/**
 * Keeps the head describing the page shown (#99): a public page's title,
 * description, canonical and Open Graph tags, or the shell's description with
 * no canonical on any other page. A pre-rendered page arrives with its own
 * head, and the title each page puts back when it goes is the one it found,
 * so a public page's title is set here too (the home page sets none itself).
 * Other pages set their own titles. It renders after the page, so its effect
 * runs after the page's (which keeps the title the page found to put back),
 * and inside the error boundary, so a page that throws takes it away with it
 * and the error screen sets its own head.
 */
function PageHead({ location }) {
  const locale = useLocale();
  useEffect(() => {
    const head = pageHead(location);
    if (head) document.title = head.title;
    applyHead(document, head);
  }, [location, locale]);
  return null;
}

export default function App() {
  usePageArrival();
  const [location] = useLocation();
  // A new language re-renders every page in it (#19). The page is not
  // remounted, so focus stays on the language switcher and nothing reloads.
  useLocale();
  return (
    <div className="flex min-h-screen flex-col bg-surface text-ink">
      <a
        href="#main"
        className="sr-only rounded-md bg-primary font-semibold text-on-primary focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:z-20 focus:inline-flex focus:min-h-11 focus:items-center focus:px-4 focus:py-2"
      >
        {t('app.skipLink')}
      </a>
      <main id="main" tabIndex={-1} className="mx-auto w-full max-w-2xl flex-1 px-4 py-8">
        {/* A page that throws shows a way forward, not a blank screen (#18);
            a new location starts fresh. */}
        <ErrorBoundary key={location} city={cityOnPath(location)}>
          <Switch>
            <Route path="/" component={HomePage} />
            <Route path="/p/:precinct" component={PrecinctPage} />
            <Route path="/learn" component={LearnPage} />
            <Route path="/learn/:topic" component={LearnTopicPage} />
            <Route path="/early-voting">
              {/* Holds the page's height while its code loads, so the footer
                  does not show and then jump down (#27). */}
              <Suspense fallback={<div className="min-h-screen" />}>
                <WaitTimesPage />
              </Suspense>
            </Route>
            <Route path="/privacy" component={PrivacyPage} />
            <Route component={NotFoundPage} />
          </Switch>
          {/* After the page, so its effect runs after the page's own. */}
          <PageHead location={location} />
        </ErrorBoundary>
      </main>
      <LanguageSwitcher />
      <SiteFooter />
    </div>
  );
}
