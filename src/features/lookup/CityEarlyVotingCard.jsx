import cityResults from '../../config/cityResults.js';
import election from '../../config/election.js';
import { getCityWaits } from '../../data/arcgis.js';
import { t as message, translated } from '../../i18n/index.js';
import { createWaitTimesStore } from '../waitTimes/useWaitTimes.js';
import { cityHours, cityScheduleFor, citySchedules } from './cityEarlyVoting.js';
import { earlyVotingStatus, formatLongDate } from './earlyVoting.js';
import { EarlyVotingSites } from './EarlyVotingCard.jsx';
import { copy, sourceName } from './resultsCopy.js';

const linkClass = 'text-primary underline';

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
      <details>
        <summary className="min-h-11 cursor-pointer py-2 font-semibold text-primary">
          {t.groupsLabel}
        </summary>
        <p>{t.days({ weekdaysOnly: false, from: hours.from, to: hours.to })}</p>
        <ul className="list-disc pl-6">
          {hours.lines.map((line) => (
            <li key={line.days}>
              {line.days}: {t.hours(line.open, line.close)}
            </li>
          ))}
        </ul>
      </details>
    </>
  );
}

/**
 * The body of a City precinct's "Early voting" card (#91): the nearest City
 * early voting (No Excuse Absentee) sites, each with its status today, its
 * own dates and hours from the City config, and while early voting runs its
 * current line count, with the County card's code (EarlyVotingSites). No
 * eligibility rules: it cites the City Board's No Excuse Absentee page and
 * links its Vote by Absentee Ballot page for voting by mail. Not the absentee
 * topic, which is the County's (#94). In the City chunk (src/cityChunk.js).
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
        <a href={hoursSource} rel="noreferrer" className={linkClass}>
          {sourceName(hoursSource)}
        </a>
        ,{' '}
        <a href={noExcuseUrl} rel="noreferrer" className={linkClass}>
          {message('results.earlyVoting.noExcuseCity')}
        </a>
        . {t.lastVerified(formatLongDate(lastVerified, { year: true }))}
      </p>
      <p className="mt-3">
        {message('results.earlyVoting.mailCity')}{' '}
        <a href={absenteeUrl} rel="noreferrer" className={linkClass}>
          {sourceName(absenteeUrl)}
        </a>
        .
      </p>
    </EarlyVotingSites>
  );
}
