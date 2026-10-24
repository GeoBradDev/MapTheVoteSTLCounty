import { track } from '../../analytics/index.js';
import Notice from '../../components/Notice.jsx';
import TextLink from '../../components/TextLink.jsx';
import election from '../../config/election.js';
import { copy } from './resultsCopy.js';

function Link({ href, onClick, children }) {
  return (
    <TextLink href={href} rel="noreferrer" onClick={onClick}>
      {children}
    </TextLink>
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
          {copy.status.unknown}{' '}
          <Link
            href={election.officialLookupUrl}
            onClick={() => track('official_lookup_open', { card: 'status' })}
          >
            {copy.officialLookup}
          </Link>
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
    <Notice as="section" variant="warning" aria-label={copy.status.label} className="mt-6">
      <p>{text}</p>
    </Notice>
  );
}
