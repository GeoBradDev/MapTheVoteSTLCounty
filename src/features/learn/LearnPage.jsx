import { useEffect, useLayoutEffect, useRef } from 'react';
import TextLink from '../../components/TextLink.jsx';
import election from '../../config/election.js';
import referrals from '../../config/referrals.js';
import { TOPIC_GROUPS } from './groups.js';
import { getLocale, useLocale } from '../../i18n/index.js';
import { copy } from './learnCopy.js';
import { getTopics } from './topics.js';
import { focusHeadingOnArrival } from '../../hydrate.js';

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

  // A layout effect, so it puts the old title back before the next page sets
  // its own (#128; see usePageTitle).
  useLayoutEffect(() => {
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
      <h1 ref={headingRef} tabIndex={-1} className="text-title font-bold">
        {copy.pageHeading}
      </h1>

      {groups.length === 0 ? (
        <p className="mt-4">
          {copy.empty.notReady}{' '}
          <TextLink href={election.countySiteUrl} rel="noreferrer">
            {copy.empty.countySite}
          </TextLink>{' '}
          {copy.empty.or}{' '}
          <TextLink href={referrals.stlCityBoard.url} rel="noreferrer">
            {copy.empty.citySite}
          </TextLink>
          .
        </p>
      ) : (
        <>
          <p className="mt-4">{copy.intro}</p>
          {groups.map(({ group, topics: inGroup }) => (
            <section key={group} aria-labelledby={`learn-${group}`} className="mt-8">
              <h2 id={`learn-${group}`} className="text-heading font-semibold">
                {copy.groups[group]}
              </h2>
              <ul className="mt-2">
                {inGroup.map((topic) => (
                  <li key={topic.id}>
                    <TextLink to={`/learn/${topic.id}`} variant="tap">
                      {topic.title}
                    </TextLink>
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
            <TextLink to="/" variant="tap">
              {copy.lookup}
            </TextLink>
          </li>
          {groups.length > 0 && (
            <>
              <li>
                <TextLink href={election.countySiteUrl} rel="noreferrer" variant="tap">
                  {copy.countySite}
                </TextLink>
              </li>
              <li>
                <TextLink href={referrals.stlCityBoard.url} rel="noreferrer" variant="tap">
                  {copy.citySite}
                </TextLink>
              </li>
            </>
          )}
        </ul>
      </nav>
    </>
  );
}
