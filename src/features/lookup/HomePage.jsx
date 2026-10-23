import { useSyncExternalStore } from 'react';
import { Link } from 'wouter';
import election from '../../config/election.js';
import referrals from '../../config/referrals.js';
import AddressLookup from './AddressLookup.jsx';
import { isElectionDay } from './electionDay.js';
import { copy } from './homeCopy.js';

// Whether it is Election Day, read after hydration: the page is pre-rendered
// (#99) with the early voting label, and a client on Election Day then
// switches it (#107) without a hydration mismatch.
const noSubscribe = () => () => {};
const electionDayNow = () => isElectionDay(Date.now());
const notElectionDay = () => false;

const linkClass = 'inline-flex min-h-11 items-center text-primary underline';
const rowClass =
  'flex min-h-11 w-full items-center rounded-md border border-border bg-surface-raised px-4 py-2 font-medium text-primary underline';

// The first screen. One job: get an address (or the device's location).
export default function HomePage() {
  const electionDay = useSyncExternalStore(noSubscribe, electionDayNow, notElectionDay);
  return (
    <>
      <header>
        {/* The election date as one compact line (#80). */}
        <p className="inline-flex min-h-8 items-center rounded-full bg-accent px-3 text-sm font-semibold text-on-accent">
          <time dateTime={election.electionDate}>
            {copy.electionDay(election.electionDate, election.timeZone)}
          </time>
        </p>
        {/* Focusable from script: the app moves focus here after an in-app link. */}
        <h1 tabIndex={-1} className="mt-3 text-3xl font-semibold">
          {copy.heading}
        </h1>
        <p className="mt-2">{copy.intro}</p>
        <p className="mt-1 text-sm text-muted">{copy.unofficial}</p>
      </header>

      {/* The first action, next to the address search (#104): no address needed. */}
      <p className="mt-2">
        <Link href="/early-voting" className={`${linkClass} font-semibold`}>
          {electionDay ? copy.waitTimesElectionDay : copy.waitTimes}
        </Link>
      </p>

      <div className="mt-2">
        <AddressLookup />
      </div>

      {/* No Election Day rule here (#165): each precinct page states its own
          jurisdiction's rule, County or City. */}
      <nav aria-label={copy.moreInfo} className="mt-8">
        {/* Tappable rows (#80). Local styling until the shared components of #78. */}
        <ul className="flex flex-col gap-2">
          <li>
            <Link href="/learn" className={rowClass}>
              {copy.howToVote}
            </Link>
          </li>
          <li>
            <a href={election.countySiteUrl} rel="noreferrer" className={rowClass}>
              {copy.countySite}
            </a>
          </li>
          <li>
            <a href={referrals.stlCityBoard.url} rel="noreferrer" className={rowClass}>
              {copy.citySite}
            </a>
          </li>
        </ul>
      </nav>
    </>
  );
}
