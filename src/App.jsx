import { useEffect, useRef } from 'react';
import { Route, Switch, useLocation } from 'wouter';
import NotFoundPage from './components/NotFoundPage.jsx';
import SiteFooter from './components/SiteFooter.jsx';
import LearnPage from './features/learn/LearnPage.jsx';
import LearnTopicPage from './features/learn/LearnTopicPage.jsx';
import HomePage from './features/lookup/HomePage.jsx';
import PrecinctPage from './features/lookup/PrecinctPage.jsx';
import PrivacyPage from './features/privacy/PrivacyPage.jsx';

/**
 * After an in-app navigation (not the first load), starts the new page at the
 * top, and when the link that was followed went away with the old page,
 * leaving focus on the body (or on main, where Safari puts it after a click),
 * moves focus to the new page's heading so a screen reader announces it.
 * Pages that focus their own heading do it in their own effects, which run
 * first, so they are left alone. Back and Forward keep the scroll position
 * the browser restores.
 */
function usePageArrival() {
  const [location] = useLocation();
  const previous = useRef(location);
  // The path a Back or Forward went to. A path, not a flag, because following
  // the skip link (a hash) fires popstate too, without a new page.
  const popped = useRef(null);

  useEffect(() => {
    const onPop = () => {
      popped.current = window.location.pathname;
    };
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);

  useEffect(() => {
    if (previous.current === location) return;
    const fromHistory = popped.current === location;
    popped.current = null;
    previous.current = location;
    if (!fromHistory) window.scrollTo(0, 0);
    const focused = document.activeElement;
    if (focused && focused !== document.body && focused.id !== 'main') return;
    document.querySelector('main h1[tabindex="-1"]')?.focus({ preventScroll: fromHistory });
  }, [location]);
}

export default function App() {
  usePageArrival();
  return (
    <div className="flex min-h-screen flex-col bg-surface text-ink">
      <a
        href="#main"
        className="sr-only rounded-md bg-primary px-4 py-2 font-semibold text-on-primary focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:z-20"
      >
        Skip to main content
      </a>
      <main id="main" tabIndex={-1} className="mx-auto w-full max-w-2xl flex-1 px-4 py-8">
        <Switch>
          <Route path="/" component={HomePage} />
          <Route path="/p/:precinct" component={PrecinctPage} />
          <Route path="/learn" component={LearnPage} />
          <Route path="/learn/:topic" component={LearnTopicPage} />
          <Route path="/privacy" component={PrivacyPage} />
          <Route component={NotFoundPage} />
        </Switch>
      </main>
      <SiteFooter />
    </div>
  );
}
