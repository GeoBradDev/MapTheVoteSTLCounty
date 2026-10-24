import Disclosure from '../../components/Disclosure.jsx';
import TextLink from '../../components/TextLink.jsx';
import cityResults from '../../config/cityResults.js';
import election from '../../config/election.js';
import { getCityWaits } from '../../data/arcgis.js';
import { t as message, translated } from '../../i18n/index.js';
import { createWaitTimesStore } from '../waitTimes/useWaitTimes.js';
import { cityHours, cityScheduleFor, citySchedules } from './cityEarlyVoting.js';
import { earlyVotingStatus, formatLongDate } from './earlyVoting.js';
import { EarlyVotingSites, MailLine } from './EarlyVotingCard.jsx';
import { EarlyVoteSummary } from './ResultsSummary.jsx';
import { copy, sourceName } from './resultsCopy.js';

const t = translated(() => copy.earlyVoting);

// The City's own line count loop, on the app's rules (#103) but asking only
// the City's layer, so a City page asks no County layer.
const { enabled, city } = election.waitTimes;
const cityWaits = createWaitTimesStore({
  county: null,
  city: enabled && city.enabled ? getCityWaits : null,
});

const scheduleOf = (site) => cityScheduleFor(site.loc);
// The City's line counts are keyed by the site's name (waitTimes.city.siteField).
const waitKeyOf = (site) => site.name;

// A City site's status today and, folded away, its own dates and hours, as
// the City Board's page lists them.
function CityDetail({ site, now }) {
  const schedule = scheduleOf(site);
  const hours = cityHours(site.loc);
  if (!schedule || !hours) return null;
  return (
    <>
      <p>{t.status(earlyVotingStatus(schedule, now, election.timeZone), formatLongDate)}</p>
      <Disclosure summary={t.groupsLabel}>
        <p>{t.days({ weekdaysOnly: false, from: hours.from, to: hours.to })}</p>
        <ul className="list-disc pl-6">
          {hours.lines.map((line) => (
            <li key={line.days}>
              {line.days}: {t.hours(line.open, line.close)}
            </li>
          ))}
        </ul>
      </Disclosure>
    </>
  );
}

/**
 * The body of a City precinct's "Early voting" card (#91): the nearest City
 * early voting (No Excuse Absentee) sites, each with its status today, its
 * own dates and hours from the City config, and while early voting runs its
 * current line count, with the County card's code (EarlyVotingSites). No
 * eligibility rules: it cites the City Board's No Excuse Absentee page and,
 * for voting by mail, links the absentee topic, which has a City section
 * (#94, #168), and the City Board's Apply to Vote Absentee page, as the
 * County card does. In the City chunk (src/cityChunk.js).
 * @param {{ code: string, origin: { lat: number, lng: number } | null,
 *   waitSource?: object }} props `waitSource` is for tests.
 */
export default function CityEarlyVotingCard({ code, origin, waitSource = cityWaits }) {
  const {
    sources: [hoursSource, noExcuseUrl, absenteeUrl],
    lastVerified,
  } = cityResults.earlyVoting;
  return (
    <EarlyVotingSites
      code={code}
      origin={origin}
      waitSource={waitSource}
      schedules={citySchedules}
      scheduleOf={scheduleOf}
      waits="city"
      waitKeyOf={waitKeyOf}
      Detail={CityDetail}
    >
      <p className="mt-3 text-sm">
        {copy.polls.source}:{' '}
        <TextLink href={hoursSource} rel="noreferrer">
          {sourceName(hoursSource)}
        </TextLink>
        ,{' '}
        <TextLink href={noExcuseUrl} rel="noreferrer">
          {message('results.earlyVoting.noExcuseCity')}
        </TextLink>
        . {t.lastVerified(formatLongDate(lastVerified, { year: true }))}
      </p>
      <MailLine href={absenteeUrl} label={sourceName(absenteeUrl)} />
    </EarlyVotingSites>
  );
}

/**
 * The City's part of the summary at the top of a City precinct's results
 * (#81): while early voting runs, the nearest City site open now and its line
 * count, from the same City loop as the card above, so the page asks only
 * the City's layer. In the City chunk (src/cityChunk.js).
 * @param {{ code: string, origin: { lat: number, lng: number } | null,
 *   waitSource?: object }} props `waitSource` is for tests.
 */
export function CityEarlyVoteSummary({ code, origin, waitSource = cityWaits }) {
  return (
    <EarlyVoteSummary
      code={code}
      origin={origin}
      waitSource={waitSource}
      schedules={citySchedules}
      scheduleOf={scheduleOf}
      waits="city"
      waitKeyOf={waitKeyOf}
    />
  );
}
