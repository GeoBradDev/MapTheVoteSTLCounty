import { useEffect, useRef } from 'react';
import { Link } from 'wouter';
import election from '../../config/election.js';
import referrals from '../../config/referrals.js';
import { TOPIC_GROUPS } from './groups.js';
import { getLocale, useLocale } from '../../i18n/index.js';
import { copy } from './learnCopy.js';
import { getTopics } from './topics.js';
import { focusHeadingOnArrival } from '../../hydrate.js';

const linkClass = 'inline-flex min-h-11 items-center text-primary underline';

// The "How to vote" index (#23): every topic, by group. Until the first topic
// is published (#22) it says so and sends the voter to the official board site
// and the address lookup instead.
export default function LearnPage() {
  const headingRef = useRef(null);
  const locale = useLocale();
  const topics = getTopics(getLocale());

  // Links to this page sit low on other pages, so move focus (and the scroll
  // position) to the heading on arrival, not when the language changes (#19).
  useEffect(() => {
    focusHeadingOnArrival(headingRef.current);
  }, []);

  useEffect(() => {
    const previous = document.title;
    document.title = copy.pageTitle(copy.pageHeading);
    return () => {
      document.title = previous;
    };
  }, [locale]);

  const groups = TOPIC_GROUPS.map((group) => ({
    group,
    topics: topics.filter((topic) => topic.group === group),
  })).filter(({ topics: inGroup }) => inGroup.length > 0);

  return (
    <>
      <h1 ref={headingRef} tabIndex={-1} className="text-2xl font-semibold">
        {copy.pageHeading}
      </h1>

      {groups.length === 0 ? (
        <p className="mt-4">
          {copy.empty.notReady}{' '}
          <a href={election.countySiteUrl} rel="noreferrer" className="text-primary underline">
            {copy.empty.countySite}
          </a>{' '}
          {copy.empty.or}{' '}
          <a href={referrals.stlCityBoard.url} rel="noreferrer" className="text-primary underline">
            {copy.empty.citySite}
          </a>
          .
        </p>
      ) : (
        <>
          <p className="mt-4">{copy.intro}</p>
          {groups.map(({ group, topics: inGroup }) => (
            <section key={group} aria-labelledby={`learn-${group}`} className="mt-8">
              <h2 id={`learn-${group}`} className="text-xl font-semibold">
                {copy.groups[group]}
              </h2>
              <ul className="mt-2">
                {inGroup.map((topic) => (
                  <li key={topic.id}>
                    <Link href={`/learn/${topic.id}`} className={linkClass}>
                      {topic.title}
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </>
      )}

      <nav aria-label={copy.moreHelp} className="mt-8 print:hidden">
        <ul className="flex flex-col gap-1">
          <li>
            <Link href="/" className={linkClass}>
              {copy.lookup}
            </Link>
          </li>
          {groups.length > 0 && (
            <>
              <li>
                <a href={election.countySiteUrl} rel="noreferrer" className={linkClass}>
                  {copy.countySite}
                </a>
              </li>
              <li>
                <a href={referrals.stlCityBoard.url} rel="noreferrer" className={linkClass}>
                  {copy.citySite}
                </a>
              </li>
            </>
          )}
        </ul>
      </nav>
    </>
  );
}
