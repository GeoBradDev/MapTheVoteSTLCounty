import { Route, Switch } from 'wouter';
import NotFoundPage from './components/NotFoundPage.jsx';
import LearnPage from './features/learn/LearnPage.jsx';
import LearnTopicPage from './features/learn/LearnTopicPage.jsx';
import HomePage from './features/lookup/HomePage.jsx';
import PrecinctPage from './features/lookup/PrecinctPage.jsx';

export default function App() {
  return (
    <main className="mx-auto min-h-screen max-w-2xl bg-surface px-4 py-8 text-ink">
      <Switch>
        <Route path="/" component={HomePage} />
        <Route path="/p/:precinct" component={PrecinctPage} />
        <Route path="/learn" component={LearnPage} />
        <Route path="/learn/:topic" component={LearnTopicPage} />
        <Route component={NotFoundPage} />
      </Switch>
    </main>
  );
}
