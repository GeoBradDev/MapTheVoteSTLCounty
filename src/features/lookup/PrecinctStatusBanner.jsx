import election from '../../config/election.js';
import { copy } from './resultsCopy.js';

const linkClass = 'text-primary underline';

function Link({ href, children }) {
  return (
    <a href={href} rel="noreferrer" className={linkClass}>
      {children}
    </a>
  );
}

function bannerText({ kind, message }) {
  switch (kind) {
    case 'nonresidential':
      // The county's own words, already plain text from parseSampleBallot.
      if (message) return message;
      return (
        <>
          {copy.status.nonresidentialFallback}{' '}
          <Link href={election.countySiteUrl}>{copy.status.countySite}</Link>.
        </>
      );
    case 'not-in-election':
      return copy.status.notInElection;
    case 'unknown':
      return (
        <>
          {copy.status.unknown} <Link href={election.officialLookupUrl}>{copy.officialLookup}</Link>
          .
        </>
      );
    default:
      return null;
  }
}

/**
 * Says when a precinct has nothing to vote on this election. Nothing for a
 * precinct in the election.
 * @param {{ status: import('./precinctStatus.js').PrecinctStatus }} props
 */
export default function PrecinctStatusBanner({ status }) {
  const text = bannerText(status);
  if (!text) return null;
  return (
    <section
      aria-label={copy.status.label}
      className="mt-6 rounded-md border-l-4 border-accent bg-surface-raised p-4"
    >
      <p>{text}</p>
    </section>
  );
}
