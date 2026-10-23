import { useSyncExternalStore } from 'react';
import { Link } from 'wouter';
import election from '../../config/election.js';
import referrals from '../../config/referrals.js';
import AddressLookup from './AddressLookup.jsx';
import CountyElectionDayRule from './CountyElectionDayRule.jsx';
import { isElectionDay } from './electionDay.js';
import { copy } from './homeCopy.js';

// Whether it is Election Day, read after hydration: the page is pre-rendered
// (#99) with the early voting label, and a client on Election Day then
// switches it (#107) without a hydration mismatch.
const noSubscribe = () => () => {};
const electionDayNow = () => isElectionDay(Date.now());
const notElectionDay = () => false;

const linkClass = 'inline-flex min-h-11 items-center text-primary underline';

// The first screen. One job: get an address (or the device's location).
export default function HomePage() {
  const electionDay = useSyncExternalStore(noSubscribe, electionDayNow, notElectionDay);
  return (
    <>
      <header>
        <p className="font-semibold text-muted">{election.electionName}</p>
        {/* Focusable from script: the app moves focus here after an in-app link. */}
        <h1 tabIndex={-1} className="mt-1 text-3xl font-semibold">
          {copy.heading}
        </h1>
        <p className="mt-2">
          <time dateTime={election.electionDate}>
            {copy.electionDay(election.electionDate, election.timeZone)}
          </time>
        </p>
        <p className="mt-2">{copy.intro}</p>
        <p className="mt-1 text-sm text-muted">{copy.unofficial}</p>
      </header>

      {/* The first action, next to the address search (#104): no address needed. */}
      <p className="mt-3">
        <Link href="/early-voting" className={`${linkClass} font-semibold`}>
          {electionDay ? copy.waitTimesElectionDay : copy.waitTimes}
        </Link>
      </p>

      <div className="mt-3">
        <AddressLookup />
      </div>

      <div className="mt-8 rounded-md bg-surface-raised p-4">
        {/* Its links sit inside sentences, so they keep the plain link style. */}
        <CountyElectionDayRule />
      </div>

      <nav aria-label={copy.moreInfo} className="mt-6">
        <ul className="flex flex-col gap-1">
          <li>
            <Link href="/learn" className={linkClass}>
              {copy.howToVote}
            </Link>
          </li>
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
        </ul>
      </nav>
    </>
  );
}
