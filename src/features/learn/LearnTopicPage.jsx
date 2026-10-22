import { useEffect, useRef } from 'react';
import { Link, useParams } from 'wouter';
import NotFoundPage from '../../components/NotFoundPage.jsx';
import { getLocale, useLocale } from '../../i18n/index.js';
import { copy } from './learnCopy.js';
import TopicArticle from './TopicArticle.jsx';
import { getTopic } from './topics.js';

const linkClass = 'inline-flex min-h-11 items-center text-primary underline';

// One "How to vote" topic (#23) at /learn/<id>, or the not-found page for an
// id with no topic.
export default function LearnTopicPage() {
  const { topic: id } = useParams();
  const locale = useLocale();
  const topic = getTopic(id, getLocale());
  const headingRef = useRef(null);
  const articleRef = useRef(null);
  const found = topic?.id;
  const title = topic?.title;

  // Focus moves to the heading on arrival only, not when the language changes
  // (#19), so it stays on the language switcher.
  useEffect(() => {
    if (found) headingRef.current?.focus();
  }, [found]);

  useEffect(() => {
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

  if (!topic) return <NotFoundPage />;

  return (
    <>
      <div ref={articleRef}>
        {/* Keyed, so the next topic starts with its sections folded. */}
        <TopicArticle key={topic.id} topic={topic} headingRef={headingRef} />
      </div>
      <nav aria-label={copy.moreHelp} className="mt-8 print:hidden">
        <ul className="flex flex-col gap-1">
          <li>
            <Link href="/learn" className={linkClass}>
              {copy.allTopics}
            </Link>
          </li>
          <li>
            <Link href="/" className={linkClass}>
              {copy.lookup}
            </Link>
          </li>
        </ul>
      </nav>
    </>
  );
}
