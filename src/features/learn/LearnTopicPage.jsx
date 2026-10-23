import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useParams } from 'wouter';
import NotFoundPage from '../../components/NotFoundPage.jsx';
import TextLink from '../../components/TextLink.jsx';
import { getLocale, useLocale } from '../../i18n/index.js';
import { copy } from './learnCopy.js';
import TopicArticle from './TopicArticle.jsx';
import { getTopic, loadedTopic, loadTopic } from './topics.js';
import { focusHeadingOnArrival } from '../../hydrate.js';

/**
 * The whole topic once its body has loaded (#147), else null; throws, for the
 * error boundary (#18), when it cannot load. While another language's body of
 * the same topic loads, the one shown stays, so a new language is not a new
 * page (#19): focus, the title and the folded sections stay as they are.
 * @param {import('./content/topic.js').TopicSummary | null} summary
 */
function useTopicBody(summary) {
  const [shown, setShown] = useState(null);
  const [error, setError] = useState(null);
  const ready = summary ? loadedTopic(summary) : null;
  // Remembers the topic last shown, as React's "adjusting state when a prop
  // changes" pattern does: during render, not in an effect.
  if (ready && ready !== shown) setShown(ready);
  const topic = ready ?? (summary && shown?.id === summary.id ? shown : null);
  useEffect(() => {
    if (!summary || ready) return undefined;
    let live = true;
    loadTopic(summary).then(
      (loaded) => live && setShown(loaded),
      (failure) => live && setError(failure),
    );
    return () => {
      live = false;
    };
  }, [summary, ready]);
  if (error) throw error;
  return topic;
}

// One "How to vote" topic (#23) at /learn/<id>, or the not-found page for an
// id with no topic. The first load has only the topic's summary; its body
// loads with this page (#147), already loaded when the page is pre-rendered
// or hydrated (src/main.jsx).
export default function LearnTopicPage() {
  const { topic: id } = useParams();
  const locale = useLocale();
  const summary = getTopic(id, getLocale());
  const topic = useTopicBody(summary);
  const headingRef = useRef(null);
  const articleRef = useRef(null);
  const found = topic?.id;
  const title = topic?.title;

  // Focus moves to the heading on arrival only, not when the language changes
  // (#19), so it stays on the language switcher.
  useEffect(() => {
    if (found) focusHeadingOnArrival(headingRef.current);
  }, [found]);

  // A layout effect, so it puts the old title back before the next page sets
  // its own (#128; see usePageTitle).
  useLayoutEffect(() => {
    if (!found) return undefined;
    const previous = document.title;
    document.title = copy.pageTitle(title);
    return () => {
      document.title = previous;
    };
  }, [found, title, locale]);

  // A folded section would print as its heading only, so open them all first,
  // then fold again the ones that were folded.
  useEffect(() => {
    let opened = [];
    const openAll = () => {
      const folded = articleRef.current?.querySelectorAll('details:not([open])') ?? [];
      for (const details of folded) {
        details.open = true;
        opened.push(details);
      }
    };
    const restore = () => {
      for (const details of opened) details.open = false;
      opened = [];
    };
    window.addEventListener('beforeprint', openAll);
    window.addEventListener('afterprint', restore);
    return () => {
      window.removeEventListener('beforeprint', openAll);
      window.removeEventListener('afterprint', restore);
    };
  }, []);

  if (!summary) return <NotFoundPage />;
  // Holds the page's height while the body loads, so the footer does not show
  // and then jump down (#27). No heading yet: the topic's own takes focus.
  if (!topic) return <div className="min-h-screen" />;

  return (
    <>
      <div ref={articleRef}>
        {/* Keyed, so the next topic starts with its sections folded. */}
        <TopicArticle key={topic.id} topic={topic} headingRef={headingRef} />
      </div>
      <nav aria-label={copy.moreHelp} className="mt-8 print:hidden">
        <ul className="flex flex-col gap-1">
          <li>
            <TextLink to="/learn" variant="tap">
              {copy.allTopics}
            </TextLink>
          </li>
          <li>
            <TextLink to="/" variant="tap">
              {copy.lookup}
            </TextLink>
          </li>
        </ul>
      </nav>
    </>
  );
}
