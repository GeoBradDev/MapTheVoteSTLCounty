// The home page's line count dot map (#184): during early voting and on
// Election Day, every County and City site on one small inline SVG map,
// colored and sized by how many people are in line, with its legend. No
// map library and no tiles: the outlines are committed (outline.js) and this
// module loads on demand, after the home page's text has painted. The map is
// one link to the wait times page, which lists everything it shows; the SVG
// itself is hidden from screen readers, and the status line and legend carry
// the data.
import { useEffect, useMemo, useState } from 'react';
import { Link } from 'wouter';
import election, { jurisdictions } from '../../config/election.js';
import { getAbsenteeSites, getPolls } from '../../data/arcgis.js';
import { earlyVotingStatus, zonedNow } from '../lookup/earlyVoting.js';
import { copy as homeCopy } from '../lookup/homeCopy.js';
import { useNow } from '../lookup/useNow.js';
import { dotMap, HOLLOW_RADIUS, project } from './dotMapModel.js';
import { homeMapMode } from './homeMapMode.js';
import { CITY_RING, COUNTY_RING, VIEW } from './outline.js';
import { OFF_WAITS, useWaitTimes } from './useWaitTimes.js';
import { clockTime, loadCityPolls, loadCitySites, useSites } from './waitSites.js';
import { copy } from './waitTimesCopy.js';

const text = homeCopy.waitMap;

// Written out in full so Tailwind finds them (waitColors.js has the tokens).
const DOT_CLASSES = Object.freeze([
  'fill-wait-1',
  'fill-wait-2',
  'fill-wait-3',
  'fill-wait-4',
  'fill-wait-5',
]);
const DOT_STROKE = 'stroke-ink';
const RING = 'fill-surface stroke-muted';

const pathOf = (ring) => {
  let d = '';
  for (let i = 0; i < ring.length; i += 2) d += `${i ? 'L' : 'M'}${ring[i]} ${ring[i + 1]}`;
  return `${d}Z`;
};
const COUNTY_PATH = pathOf(COUNTY_RING);
const CITY_PATH = pathOf(CITY_RING);

// Where the City's label sits: just east of the City, over the river, where
// neither outline is drawn.
const cityXs = CITY_RING.filter((_, i) => i % 2 === 0);
const cityYs = CITY_RING.filter((_, i) => i % 2 === 1);
const CITY_LABEL = {
  x: Math.max(...cityXs) + 5,
  y: (Math.min(...cityYs) + Math.max(...cityYs)) / 2,
};

// Graticule ticks on the frame's right and bottom edges, labeled where no
// outline is drawn: east of the County for latitude (not 38.8, beside the
// County's north end), under it for longitude.
const LAT_TICKS = [38.5, 38.6, 38.7, 38.8].map((lat) => ({
  lat,
  y: project(-90.5, lat)[1],
  label: lat < 38.75,
}));
const LNG_TICKS = [-90.6, -90.4, -90.2].map((lng) => ({ lng, x: project(lng, 38.6)[0] }));

const KEYS = ['county', 'city'];

// Answered since the sites opened, and not asking again after the loop was
// stopped (a tab hidden or frozen): the loop says which (`resuming`).
function answeredSince(part, openedAt) {
  if (part.status === 'off') return true;
  const { answeredAt } = part;
  if (answeredAt === null || answeredAt < openedAt) return false;
  return !part.resuming;
}

function Swatch({ step, r }) {
  const size = 2 * 9 + 2;
  return (
    <svg
      aria-hidden="true"
      focusable="false"
      viewBox={`0 0 ${size} ${size}`}
      className="size-5 shrink-0"
    >
      <circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        strokeWidth={step === null ? 1.5 : 1}
        className={step === null ? RING : `${DOT_CLASSES[step]} ${DOT_STROKE}`}
      />
    </svg>
  );
}

function Legend({ legend }) {
  return (
    <div className="mt-2 text-sm">
      <p id="home-map-legend" className="font-semibold">
        {copy.map.legend}
      </p>
      <ul aria-labelledby="home-map-legend" className="mt-1 flex flex-wrap gap-x-4 gap-y-1">
        {legend.map((entry) => (
          <li key={entry.min} className="flex items-center gap-1.5">
            <Swatch step={entry.token} r={entry.r} />
            {copy.map.bin(entry)}
          </li>
        ))}
        <li className="flex items-center gap-1.5">
          <Swatch step={null} r={HOLLOW_RADIUS} />
          {text.hollow}
        </li>
      </ul>
    </div>
  );
}

function MapDrawing({ dots }) {
  return (
    <svg
      aria-hidden="true"
      focusable="false"
      viewBox={`0 0 ${VIEW.width} ${VIEW.height}`}
      className="block min-h-60 w-full grow basis-0 sm:min-h-72"
    >
      <g className="fill-muted text-[9px] tabular-nums">
        {LAT_TICKS.map(({ lat, y, label }) => (
          <g key={lat}>
            <line
              x1={VIEW.width}
              x2={VIEW.width - 4}
              y1={y}
              y2={y}
              className="stroke-border-strong"
              strokeWidth="0.75"
            />
            {label && (
              <text x={VIEW.width - 6} y={y + 3} textAnchor="end">
                {`${lat.toFixed(1)}°N`}
              </text>
            )}
          </g>
        ))}
        {LNG_TICKS.map(({ lng, x }) => (
          <g key={lng}>
            <line
              x1={x}
              x2={x}
              y1={VIEW.height}
              y2={VIEW.height - 4}
              className="stroke-border-strong"
              strokeWidth="0.75"
            />
            <text x={x} y={VIEW.height - 6} textAnchor="middle">
              {`${Math.abs(lng).toFixed(1)}°W`}
            </text>
          </g>
        ))}
      </g>
      <path
        data-outline="county"
        d={COUNTY_PATH}
        className="fill-surface-raised stroke-border-strong"
        strokeWidth="1"
        strokeLinejoin="round"
      />
      <path
        data-outline="city"
        d={CITY_PATH}
        className="fill-surface-sunken stroke-border-strong"
        strokeWidth="1"
        strokeLinejoin="round"
      />
      <g className="fill-muted text-[11px] font-semibold uppercase tracking-wider">
        <text x="24" y="40">
          {text.county}
        </text>
        <text x={CITY_LABEL.x} y={CITY_LABEL.y}>
          {text.city}
        </text>
      </g>
      <g>
        {dots.map((dot) => (
          <circle
            key={dot.key}
            data-dot={dot.token === null ? 'hollow' : 'count'}
            cx={dot.x.toFixed(1)}
            cy={dot.y.toFixed(1)}
            r={dot.r}
            strokeWidth={dot.token === null ? 1.5 : 0.75}
            className={dot.token === null ? RING : `${DOT_CLASSES[dot.token]} ${DOT_STROKE}`}
          />
        ))}
      </g>
    </svg>
  );
}

// The line under the heading: when the counts were checked, or when sites
// open again.
function statusLine(model, waits, electionDay, now, settled) {
  if (!model) return '';
  if (model.anyOpen) {
    // Nothing until the first answer: no time from before, no "no counts".
    if (!settled) return '';
    const asked = KEYS.filter((key) => waits[key].status !== 'off');
    const failed = asked.filter((key) => waits[key].status === 'unavailable');
    if (failed.length && failed.length === asked.length) return text.unavailable;
    // One board's counts failing is said, so its sites' rings are not read
    // as closed.
    if (failed.length) return text.boardUnavailable(jurisdictions[failed[0]].name);
    // Only a check made since the sites opened is "now".
    const times = KEYS.map((key) => waits[key].checkedAt).filter(
      (at) => at !== null && at >= model.openedAt,
    );
    return times.length ? copy.status.checked(clockTime(Math.max(...times))) : '';
  }
  const { open, close } = election.electionDayHours;
  if (model.ended) return text.ended(open, close);
  if (!model.nextOpen) return '';
  if (electionDay) return text.pollsOpen(model.nextOpen.time);
  return model.nextOpen.date === zonedNow(now, election.timeZone).date
    ? text.openToday(model.nextOpen.time)
    : text.openOn(model.nextOpen.date, model.nextOpen.time);
}

/**
 * @param {{ onClose: () => void, loadSites?: () => Promise<object>,
 *   loadCity?: typeof loadCitySites, loadPolls?: () => Promise<object>,
 *   loadCityPolls?: () => Promise<object>,
 *   waitSource?: Parameters<typeof useWaitTimes>[0] }} props The loaders and
 *   the line count loop, for tests; the app reads the shared loop.
 */
export default function WaitDotMap({
  onClose,
  loadSites = getAbsenteeSites,
  loadCity = loadCitySites,
  loadPolls = getPolls,
  loadCityPolls: loadCityDay = loadCityPolls,
  waitSource,
}) {
  const now = useNow();
  const mode = homeMapMode(now);
  const electionDay = mode === 'electionDay';
  const { result } = useSites(loadSites, loadCity, loadPolls, loadCityDay, electionDay);
  // Rows loaded for the other mode (the day just turned to Election Day) are
  // not shown: the polling places replace them.
  const rows = result?.mode === (electionDay ? 'electionDay' : 'earlyVoting') ? result.rows : null;
  // The line count layers are asked only while a site is open (nights, the
  // evening before Election Day and its early morning ask nothing), as the
  // results page's cards do.
  const anyOpen = useMemo(
    () =>
      Boolean(
        rows?.some(
          (row) => earlyVotingStatus(row.schedule, now, election.timeZone).kind === 'openNow',
        ),
      ),
    [rows, now],
  );
  // The shared loop the wait times page reads, so coming back to the home
  // page asks nothing outside its interval.
  const waits = useWaitTimes(anyOpen ? waitSource : OFF_WAITS);
  const model = useMemo(
    () => (rows ? dotMap({ rows, waits: waits.waits, now }) : null),
    [rows, waits.waits, now],
  );
  // Settled once each board asked has answered since the sites opened: the
  // shared loop may still hold an answer from the evening before (a page left
  // open, or a phone woken the next morning), which is not these lines. Nor
  // while the loop resumes after a long gap (a phone woken later the same
  // day): the counts the loop dropped as too old are not "no count".
  const settled = !model?.anyOpen || KEYS.every((key) => answeredSince(waits[key], model.openedAt));

  // Closes when the window ends or a board's sites cannot be loaded: with no
  // map to draw, the home page is as it was, with its wait times link. Counts
  // that are stale or cannot be loaded do not close it: the box is already on
  // screen at its reserved height, and closing it would move everything below
  // (#27). The sites then show as hollow rings, and a line says so.
  useEffect(() => {
    if (mode === 'off' || result?.error || result?.failed) onClose();
  }, [mode, result, onClose]);

  const heading = electionDay ? text.headingElectionDay : text.heading;
  const mapLabel = electionDay ? text.mapLinkElectionDay : text.mapLink;
  const status = statusLine(model, waits, electionDay, now, settled);
  // Once shown, the legend stays while the counts are first asked
  // (when a site opens with the page open, the answer can take a few
  // seconds); the no-count line and the status line wait for the answer.
  const [shownOnce, setShownOnce] = useState(false);
  if (model && settled && !shownOnce) setShownOnce(true);
  const ready = Boolean(model && (settled || shownOnce));

  return (
    <section aria-labelledby="home-map-heading" className="flex grow flex-col">
      <h2 id="home-map-heading" className="text-heading font-semibold">
        {heading}
      </h2>
      {/* Room for two lines on a phone, one on a wider screen, so the map
          below never moves when the line arrives. */}
      <p className="min-h-10 text-sm text-muted sm:min-h-5">{ready ? status : ''}</p>
      {/* The whole map is one link to the wait times page (single dots are
          too small to tap). The link lies over the drawing and is named by
          its own text, so the drawing's labels are not part of its name. */}
      {/* The card takes the box's spare height (#216): the drawing scales into
          it, so the legend's last line ends at the box's reserved bottom
          and the wait times button follows with no gap, however many legend
          rows the counts need. */}
      <div className="relative mt-1 flex grow basis-0 flex-col rounded-card border border-border bg-surface px-2 py-1">
        {model ? (
          <MapDrawing dots={model.dots} />
        ) : (
          <div
            data-testid="home-map-skeleton"
            className="min-h-60 w-full grow basis-0 rounded-card bg-surface-sunken motion-safe:animate-pulse sm:min-h-72"
          />
        )}
        <Link to="/early-voting" className="absolute inset-0 rounded-card">
          <span className="sr-only">{mapLabel}</span>
        </Link>
      </div>
      {ready && (
        <>
          <Legend legend={model.legend} />
          {model.stale && settled && <p className="mt-3 text-sm">{text.noCounts}</p>}
        </>
      )}
    </section>
  );
}
