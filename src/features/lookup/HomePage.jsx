import { Link } from 'wouter';
import election from '../../config/election.js';
import AddressLookup from './AddressLookup.jsx';
import AssignedPollingPlace from './AssignedPollingPlace.jsx';
import { copy } from './homeCopy.js';

const linkClass = 'inline-flex min-h-11 items-center text-primary underline';

// The first screen. One job: get an address (or the device's location).
export default function HomePage() {
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

      <div className="mt-6">
        <AddressLookup />
      </div>

      <div className="mt-8 rounded-md bg-surface-raised p-4">
        {/* Its links sit inside sentences, so they keep the plain link style. */}
        <AssignedPollingPlace />
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
        </ul>
      </nav>
    </>
  );
}
