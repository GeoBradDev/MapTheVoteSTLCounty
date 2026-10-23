import { useSyncExternalStore } from 'react';
import TextLink from '../../components/TextLink.jsx';
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

// The first screen. One job: get an address (or the device's location).
export default function HomePage() {
  const electionDay = useSyncExternalStore(noSubscribe, electionDayNow, notElectionDay);
  return (
    <>
      <header>
        {/* Focusable from script: the app moves focus here after an in-app link. */}
        <h1 tabIndex={-1} className="text-title font-bold">
          {copy.heading}
        </h1>
        {/* The election date as one compact line (#80), after the heading so
            reading on from the focused h1 reaches it. */}
        <p className="mt-2">
          <time
            dateTime={election.electionDate}
            className="inline-block rounded-full bg-accent px-3 py-1 text-sm font-semibold text-on-accent"
          >
            {copy.electionDay(election.electionDate, election.timeZone)}
          </time>
        </p>
        <p className="mt-2">{copy.intro}</p>
        <p className="mt-1 text-sm text-muted">{copy.unofficial}</p>
      </header>

      {/* The first action, next to the address search (#104): no address needed. */}
      <p className="mt-2">
        <TextLink to="/early-voting" variant="tap" className="font-semibold">
          {electionDay ? copy.waitTimesElectionDay : copy.waitTimes}
        </TextLink>
      </p>

      <div className="mt-2">
        <AddressLookup />
      </div>

      {/* No Election Day rule here (#165): each precinct page states its own
          jurisdiction's rule, County or City. */}
      <nav aria-label={copy.moreInfo} className="mt-8">
        {/* Tappable rows (#80). */}
        <ul className="flex flex-col gap-2">
          <li>
            <TextLink to="/learn" variant="row">
              {copy.howToVote}
            </TextLink>
          </li>
          <li>
            <TextLink href={election.countySiteUrl} rel="noreferrer" variant="row">
              {copy.countySite}
            </TextLink>
          </li>
          <li>
            <TextLink href={referrals.stlCityBoard.url} rel="noreferrer" variant="row">
              {copy.citySite}
            </TextLink>
          </li>
        </ul>
      </nav>
    </>
  );
}
