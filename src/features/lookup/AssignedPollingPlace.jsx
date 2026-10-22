import election from '../../config/election.js';
import referrals from '../../config/referrals.js';
import { copy } from './assignedPollingPlaceCopy.js';

/** `tel:` link for a US number written like 555-555-0100. */
function telHref(phone) {
  return `tel:+1${phone.replaceAll('-', '')}`;
}

/**
 * The Election Day rule for St. Louis County (#72): vote at your assigned
 * polling place, how to confirm it, and the sources. County data assigns no
 * polling place to a precinct, so this says how to find it rather than
 * naming one.
 * @param {{ linkClass?: string }} props
 */
export default function AssignedPollingPlace({ linkClass = 'text-primary underline' }) {
  const { sources, phone, phoneSource } = election.electionDayPollingPlace;
  return (
    <>
      <p className="font-semibold">{copy.rule}</p>
      <p className="mt-2">{copy.central}</p>
      <p className="mt-2">
        {copy.confirm}{' '}
        <a href={telHref(phone)} className={linkClass}>
          {phone}
        </a>
        .
      </p>
      <p className="mt-2">
        {copy.mayAlso}{' '}
        <a href={referrals.moVoterOutreach.url} rel="noreferrer" className={linkClass}>
          {copy.stateLookup}
        </a>
        .
      </p>
      <p className="mt-2 text-sm">
        {copy.sources}{' '}
        {[...sources, phoneSource].map((url, i) => (
          <span key={url}>
            {i > 0 && ', '}
            <a href={url} rel="noreferrer" className={linkClass}>
              {copy.sourceNames[new URL(url).host]}
            </a>
          </span>
        ))}
      </p>
    </>
  );
}
