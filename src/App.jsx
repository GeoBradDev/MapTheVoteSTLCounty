import { Route, Switch } from 'wouter';
import NotFoundPage from './components/NotFoundPage.jsx';
import SiteFooter from './components/SiteFooter.jsx';
import LearnPage from './features/learn/LearnPage.jsx';
import LearnTopicPage from './features/learn/LearnTopicPage.jsx';
import HomePage from './features/lookup/HomePage.jsx';
import PrecinctPage from './features/lookup/PrecinctPage.jsx';
import PrivacyPage from './features/privacy/PrivacyPage.jsx';

export default function App() {
  return (
    <div className="flex min-h-screen flex-col bg-surface text-ink">
      <main className="mx-auto w-full max-w-2xl flex-1 px-4 py-8">
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
