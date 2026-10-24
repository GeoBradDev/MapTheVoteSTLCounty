import { Component, lazy, Suspense, useCallback, useState, useSyncExternalStore } from 'react';
import TextLink from '../../components/TextLink.jsx';
import election from '../../config/election.js';
import referrals from '../../config/referrals.js';
import AddressLookup from './AddressLookup.jsx';
import { isElectionDay } from './electionDay.js';
import { homeMapMode } from '../waitTimes/homeMapMode.js';
import { copy } from './homeCopy.js';

// The line count dot map (#184) loads on demand, after the page's text has
// painted, so the map, its outlines and its model stay out of the first load
// (#27). It comes with the wait times page's chunk (see WaitTimesPage.jsx).
const WaitDotMap = lazy(() =>
  import('../waitTimes/WaitTimesPage.jsx').then((m) => ({ default: m.WaitDotMap })),
);

// Whether it is Election Day, read after hydration: the page is pre-rendered
// (#99) with the early voting label, and a client on Election Day then
// switches it (#107) without a hydration mismatch.
const noSubscribe = () => () => {};
const electionDayNow = () => isElectionDay(Date.now());
const notElectionDay = () => false;
// Whether the dot map's window is open now, read after hydration like the
// above; the pre-rendered page leaves the box to the head script and the CSS.
const mapModeNow = () => homeMapMode(Date.now());
const serverMapMode = () => 'server';

// A map that fails to load or render closes its box (#184): the page is then
// the home page as it was, with its wait times link.
class MapBoundary extends Component {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch() {
    this.props.onFail();
  }

  render() {
    return this.state.failed ? null : this.props.children;
  }
}

/**
 * The dot map's box (#184). Pre-rendered empty: before the app runs, the head
 * script (src/prerender/homeMapScript.js) marks <html> while the map window is
 * open, and src/index.css reserves the box's height then, so nothing below it
 * moves when the map arrives. After hydration `data-open` or `data-closed`
 * decides.
 */
function MapBox() {
  const mode = useSyncExternalStore(noSubscribe, mapModeNow, serverMapMode);
  const [closed, setClosed] = useState(false);
  const close = useCallback(() => setClosed(true), []);
  const open = mode !== 'server' && mode !== 'off' && !closed;
  const state = mode === 'server' ? {} : open ? { 'data-open': '' } : { 'data-closed': '' };
  return (
    <div data-home-map-box="" className="mt-6" {...state}>
      {open && (
        <MapBoundary onFail={close}>
          <Suspense fallback={null}>
            <WaitDotMap onClose={close} />
          </Suspense>
        </MapBoundary>
      )}
    </div>
  );
}

// The first screen. One job: get an address (or the device's location).
// During early voting and on Election Day the line count dot map (#184) comes
// first, with the address search right after it.
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
            className="inline-block rounded-full bg-info-fill px-3 py-1 text-sm font-semibold text-info-ink"
          >
            {copy.electionDay(election.electionDate, election.timeZone)}
          </time>
        </p>
        <p className="mt-2">{copy.intro}</p>
        <p className="mt-1 text-sm text-muted">{copy.unofficial}</p>
      </header>

      <MapBox />

      {/* The first action, next to the address search (#104): no address needed. */}
      <p className="mt-2">
        <TextLink to="/early-voting" variant="tap" className="font-semibold">
          {electionDay ? copy.waitTimesElectionDay : copy.waitTimes}
        </TextLink>
      </p>

      <div className="mt-2">
        <AddressLookup />
      </div>

      {/* No Election Day rule of its own here (#165): each precinct page
          states its own jurisdiction's rule, County or City. The dot map
          (#184) repeats only the wait times page's line that each board's
          sites are for its own voters. */}
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
