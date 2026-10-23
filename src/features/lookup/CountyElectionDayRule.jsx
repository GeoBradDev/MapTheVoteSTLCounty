import Disclosure from '../../components/Disclosure.jsx';
import TextLink from '../../components/TextLink.jsx';
import election from '../../config/election.js';
import { copy } from './countyElectionDayRuleCopy.js';

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
 */
export default function CountyElectionDayRule() {
  const { sources, phone, phoneSource } = election.electionDayPollingPlace;
  return (
    <>
      <p className="font-semibold">{copy.rule}</p>
      <Disclosure summary={copy.more}>
        <p>{copy.cityNote}</p>
        <p className="mt-2">
          {copy.help} <TextLink href={telHref(phone)}>{phone}</TextLink>.
        </p>
        <p className="mt-2 text-sm">
          {copy.sources}{' '}
          {[...sources, phoneSource].map((url, i) => (
            <span key={url}>
              {i > 0 && ', '}
              <TextLink href={url} rel="noreferrer">
                {copy.sourceNames[new URL(url).host]}
              </TextLink>
            </span>
          ))}
        </p>
      </Disclosure>
    </>
  );
}
