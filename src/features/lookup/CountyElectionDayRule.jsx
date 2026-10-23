import election from '../../config/election.js';
import { copy } from './countyElectionDayRuleCopy.js';
import Disclosure from './Disclosure.jsx';

/** `tel:` link for a US number written like 555-555-0100. */
function telHref(phone) {
  return `tel:+1${phone.replaceAll('-', '')}`;
}

/**
 * The Election Day rule for St. Louis County (owner decision on #152,
 * reversing #72): a registered County voter may vote at any polling place in
 * the County. It does not apply in the City of St. Louis, which has its own
 * rule (CityElectionDayRule). Then, folded away under the rule (#81): that
 * note, the county board's number and the sources.
 * @param {{ linkClass?: string }} props
 */
export default function CountyElectionDayRule({ linkClass = 'text-primary underline' }) {
  const { sources, phone, phoneSource } = election.electionDayPollingPlace;
  return (
    <>
      <p className="font-semibold">{copy.rule}</p>
      <Disclosure summary={copy.more}>
        <p>{copy.cityNote}</p>
        <p className="mt-2">
          {copy.help}{' '}
          <a href={telHref(phone)} className={linkClass}>
            {phone}
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
      </Disclosure>
    </>
  );
}
