import { useEffect, useRef } from 'react';
import { Link, useParams } from 'wouter';
import NotFoundPage from '../../components/NotFoundPage.jsx';
import { learnCopy } from './learnCopy.js';
import TopicArticle from './TopicArticle.jsx';
import { getTopic } from './topics.js';

const copy = learnCopy.en;
const linkClass = 'inline-flex min-h-11 items-center text-primary underline';

// One "How to vote" topic (#23) at /learn/<id>, or the not-found page for an
// id with no topic.
export default function LearnTopicPage() {
  const { topic: id } = useParams();
  const topic = getTopic(id);
  const headingRef = useRef(null);
  const articleRef = useRef(null);
  const title = topic?.title;

  useEffect(() => {
    if (!title) return undefined;
    headingRef.current?.focus();
    const previous = document.title;
    document.title = copy.pageTitle(title);
    return () => {
      document.title = previous;
    };
  }, [title]);

  // A folded section would print as its heading only, so open them all first.
  useEffect(() => {
    const openAll = () => {
      for (const details of articleRef.current?.querySelectorAll('details') ?? []) {
        details.open = true;
      }
    };
    window.addEventListener('beforeprint', openAll);
    return () => window.removeEventListener('beforeprint', openAll);
  }, []);

  if (!topic) return <NotFoundPage />;

  return (
    <>
      <div ref={articleRef}>
        <TopicArticle topic={topic} headingRef={headingRef} />
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
