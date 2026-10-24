// Fixtures are live responses recorded by scripts/record-fixtures.mjs. The real
// data client runs against a stubbed fetch. The page is imported fresh for each
// test, since the client caches the polls list for the page's lifetime.
import {
  cleanup,
  configure,
  getConfig,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Route, Router } from 'wouter';
import { memoryLocation } from 'wouter/memory-location';
import absenteeSites from '../../../docs/raw/fixtures/absentee-sites.json';
import polls from '../../../docs/raw/fixtures/polls.json';
import precinctAtCity from '../../../docs/raw/fixtures/precinct-at-city.json';
import precinctGeometry from '../../../docs/raw/fixtures/precinct-geometry.json';
import byId from '../../../docs/raw/fixtures/precinct-by-id.json';
import nonresidential from '../../../docs/raw/fixtures/precinct-nonresidential.json';
import { copy as lookupsCopy } from '../../components/officialLookupsCopy.js';
import election from '../../config/election.js';
import { RETRY_DELAY_MS } from '../../data/arcgis.js';
import referrals from '../../config/referrals.js';
import { createFakeGeocoder } from '../../test/fakeGeocoder.js';
import { nearestPolls, polygonCenter } from './nearbyPolls.js';
import { formatLongDate } from './earlyVoting.js';
import { copy, formatTime } from './resultsCopy.js';

let fetchMock;
let PrecinctPage;
let rememberLookupPoint;

function respond(body, status = 200) {
  return Promise.resolve(new Response(JSON.stringify(body), { status }));
}

// Answers the polls, absentee sites and precinct outline queries from their
// fixtures, and the precinct query with `precinct` (a body, or a function of
// the URL).
function routeFetch(precinct) {
  fetchMock.mockImplementation((input) => {
    const url = new URL(input);
    if (url.pathname.includes(election.layers.polls)) {
      const absentee = url.searchParams.get('where') === election.absenteeWhere;
      return respond(absentee ? absenteeSites : polls);
    }
    if (url.searchParams.get('f') === 'geojson') return respond(precinctGeometry);
    return typeof precinct === 'function' ? precinct(url) : respond(precinct);
  });
}

const precinctCalls = () =>
  fetchMock.mock.calls
    .map(([input]) => new URL(input))
    .filter((url) => url.pathname.includes(election.layers.precincts));

// A precinct-by-id response whose one precinct has these attributes changed.
function withAttributes(fixture, changes) {
  const [feature] = fixture.features;
  return {
    ...fixture,
    features: [{ ...feature, attributes: { ...feature.attributes, ...changes } }],
  };
}

// The first role query on this page can take about 200 ms in jsdom, and a wait
// that times out reports failure without a last check. On a busy machine the
// default 1000 ms then ran out before the page had rendered (#64). Vitest's
// 5000 ms test timeout still bounds the whole test, so a test's waits share it.
let defaultWait;
beforeAll(() => {
  defaultWait = getConfig().asyncUtilTimeout;
  configure({ asyncUtilTimeout: 4000 });
});

afterAll(() => {
  configure({ asyncUtilTimeout: defaultWait });
});

beforeEach(async () => {
  fetchMock = vi.fn();
  vi.stubGlobal('fetch', fetchMock);
  vi.resetModules();
  PrecinctPage = (await import('./PrecinctPage.jsx')).default;
  ({ rememberLookupPoint } = await import('./lookupPoint.js'));
});

// Whether any of this test's answers is one query() retries: a failed fetch,
// a 5xx or a 429 (isTransient in src/data/arcgis.js).
const retried = (mock) =>
  mock.mock.settledResults.some(
    ({ type, value }) =>
      type === 'rejected' ||
      (type === 'fulfilled' && (value?.status >= 500 || value?.status === 429)),
  );

// A retry waits RETRY_DELAY_MS on a real timer, and unmounting does not stop
// one already waiting: it then called the global fetch, by then a later
// test's stub, and failed that test's request checks (#186). So unmount, let
// failures still being handled arm their retries, and, if any did, wait out
// the delay here: Node fires timers of the same delay in the order they were
// set, so each retry reaches this test's own stub before the next test starts.
afterEach(async () => {
  cleanup();
  await new Promise((resolve) => setTimeout(resolve, 0));
  if (retried(fetchMock)) await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY_MS));
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

function renderAt(code) {
  const location = memoryLocation({ path: `/p/${code}`, record: true });
  render(
    <Router hook={location.hook}>
      <Route path="/p/:precinct" component={PrecinctPage} />
    </Router>,
  );
  return location;
}

const heading = () => screen.getByRole('heading', { level: 1 });
const liveRegion = () => document.querySelector('[aria-live="polite"]');
// The section headings in page order, less the summary's own (#81). The
// sample ballot's is in the summary.
const cardHeadings = () =>
  screen
    .getAllByRole('heading', { level: 2 })
    .map((h) => h.textContent)
    .filter((name) => !Object.values(copy.summary).includes(name));
const ready = (code) => screen.findByText(copy.ready(code));

// The page's alert is always there, empty until a load fails, so waiting for
// an alert alone can return it before the message arrives (#64). The address
// search shown for "not found" brings more, empty, alerts. This waits for the
// one alert that holds `text`.
async function alertSaying(text) {
  const holding = () =>
    screen
      .getAllByRole('alert')
      .filter((alert) => alert.textContent.replace(/\s+/g, ' ').includes(text));
  await waitFor(() => expect(holding(), `one alert saying "${text}"`).toHaveLength(1));
  return holding()[0];
}

describe('PrecinctPage', () => {
  it('loads only the precinct in the URL', async () => {
    routeFetch(byId);
    renderAt('CC007');
    await ready('CC007');
    const urls = fetchMock.mock.calls.map(([input]) => new URL(input));
    const precinctQueries = urls.filter(
      (url) =>
        url.pathname.includes(election.layers.precincts) && url.searchParams.get('f') === 'json',
    );
    expect(precinctQueries).toHaveLength(1);
    expect(precinctQueries[0].searchParams.get('where')).toBe("precinct='CC007'");
    // Everything else is the polls list, the polling place rooms (#100), this
    // precinct's outline, or, while early voting runs, the boards' line counts
    // (#105), which carry nothing about the voter.
    const { county, city } = election.waitTimes;
    const waitLayer = (url) =>
      [county, city].some((s) => url.href.startsWith(`${s.serviceRoot}/${s.layer}/`));
    for (const url of urls.filter((u) => !precinctQueries.includes(u))) {
      if (url.pathname.includes(election.layers.polls)) continue;
      if (url.pathname.includes(election.layers.pollRooms)) {
        expect(url.href).not.toContain('CC007');
        continue;
      }
      if (waitLayer(url)) {
        expect(url.href).not.toContain('CC007');
        continue;
      }
      expect(url.pathname).toContain(election.layers.precincts);
      expect(url.searchParams.get('f')).toBe('geojson');
      expect(url.searchParams.get('where')).toBe("precinct='CC007'");
    }
  });

  // #27: the cards' requests do not wait for the precinct to answer.
  it('requests the polls, absentee sites, rooms and outline while the precinct loads', () => {
    fetchMock.mockImplementation(() => new Promise(() => {}));
    renderAt('CC007');
    const urls = fetchMock.mock.calls.map(([input]) => new URL(input));
    const polls = urls.filter((url) => url.pathname.includes(election.layers.polls));
    expect(polls.map((url) => url.searchParams.get('where')).sort()).toEqual(
      ['1=1', election.absenteeWhere].sort(),
    );
    // One rooms request, shared by both cards (#100).
    expect(urls.filter((url) => url.pathname.includes(election.layers.pollRooms))).toHaveLength(1);
    const outline = precinctCalls().filter((url) => url.searchParams.get('f') === 'geojson');
    expect(outline).toHaveLength(1);
    expect(outline[0].searchParams.get('where')).toBe("precinct='CC007'");
  });

  it('asks for no outline up front when a looked-up point measures the distances', () => {
    fetchMock.mockImplementation(() => new Promise(() => {}));
    rememberLookupPoint('CC007', { lat: 38.66, lng: -90.45 });
    renderAt('CC007');
    expect(precinctCalls().filter((url) => url.searchParams.get('f') === 'geojson')).toEqual([]);
  });

  it('starts no other request for URL text that is not a precinct code', async () => {
    renderAt('Polls%20moved');
    await screen.findByRole('region', { name: copy.searchInstead });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('shows the heading and skeletons, and an empty live region, while loading', () => {
    // During early voting, so the summary's early voting part comes next.
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(Date.UTC(2026, 9, 22, 15)));
    fetchMock.mockImplementation(() => new Promise(() => {}));
    renderAt('CC007');
    expect(heading()).toHaveTextContent(copy.heading);
    expect(screen.getByText(copy.precinct('CC007'))).toBeInTheDocument();
    expect(liveRegion()).toBeInTheDocument();
    expect(liveRegion()).toHaveTextContent(/^$/);
    const skeleton = screen.getByTestId('results-skeleton');
    // At least a screen tall, so the footer does not jump when results arrive (#27).
    expect(skeleton).toHaveClass('min-h-screen');
    expect(skeleton.querySelector('.motion-reduce\\:animate-none')).not.toBeNull();
    // Every placeholder bar is hidden from screen readers.
    for (const bar of skeleton.querySelectorAll('.animate-pulse')) {
      expect(bar.closest('[aria-hidden="true"]')).not.toBeNull();
    }
    // The summary's Election Day part needs no data, so it shows while the
    // precinct loads: its line is the page's largest text, and painting it
    // before the precinct answers keeps LCP off the request (#27, #156).
    const { open, close } = election.electionDayHours;
    expect(screen.getAllByRole('heading', { level: 2 }).map((h) => h.textContent)).toEqual([
      copy.summary.electionDay,
    ]);
    expect(
      within(skeleton).getByText(
        copy.summary.when(
          formatLongDate(election.electionDate),
          formatTime(open),
          formatTime(close),
        ),
      ),
    ).toBeVisible();
    // The share note needs only the code, so it shows too (#156); the share
    // button comes with the results.
    // Painted, but hidden from screen readers until the button it describes comes.
    expect(screen.getByText(copy.share.note('CC007'))).toHaveAttribute('aria-hidden', 'true');
    expect(screen.queryByRole('button', { name: copy.share.button })).toBeNull();
    // Nothing in it takes focus: a link focused there would be lost, focus
    // and all, when the skeleton goes.
    expect(skeleton.querySelectorAll('a, button, input, [tabindex]')).toHaveLength(0);
    expect(screen.getByRole('link', { name: copy.searchAnother })).toHaveAttribute('href', '/');
  });

  // Outside early voting the sample ballot part is the second in the summary,
  // and its fixed intro is the largest text on a phone, so it shows while the
  // precinct loads (#27, #156), with the hours note above it as text.
  it.each([
    ['after early voting closes', new Date(Date.UTC(2026, 10, 3, 2))],
    ['on Election Day', new Date(Date.UTC(2026, 10, 3, 15))],
  ])('shows the sample ballot intro while loading %s', (_, at) => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(at);
    fetchMock.mockImplementation(() => new Promise(() => {}));
    renderAt('CC007');
    const skeleton = screen.getByTestId('results-skeleton');
    expect(screen.getAllByRole('heading', { level: 2 }).map((h) => h.textContent)).toEqual([
      copy.summary.electionDay,
      copy.cards.ballot,
    ]);
    const ballot = within(skeleton).getByRole('region', { name: copy.cards.ballot });
    expect(within(ballot).getByText(copy.ballot.intro)).toBeVisible();
    expect(within(skeleton).getByText(new RegExp(`${copy.polls.source}:`))).toBeVisible();
    for (const bar of skeleton.querySelectorAll('.animate-pulse')) {
      expect(bar.closest('[aria-hidden="true"]')).not.toBeNull();
    }
    expect(skeleton.querySelectorAll('a, button, input, [tabindex]')).toHaveLength(0);
  });

  it('keeps the sample ballot intro, then says the ballot was not found, when the link fails the checks', async () => {
    routeFetch(
      withAttributes(byId, {
        html: 'Sample Ballot: <a href=https://example.org/b.pdf>CC-007.pdf</a>',
      }),
    );
    renderAt('CC007');
    await ready('CC007');
    const card = screen.getByRole('region', { name: copy.cards.ballot });
    const lines = [...card.querySelectorAll('p')].map((p) => p.textContent);
    expect(lines[0]).toBe(copy.ballot.intro);
    expect(lines[1]).toMatch(new RegExp(`^${copy.ballot.missing}`));
  });

  it('shows the header, no banner, the summary and the cards in order for an In Election precinct', async () => {
    routeFetch(byId);
    renderAt('CC007');
    expect(await ready('CC007')).toBe(liveRegion());
    // The answer first, then the precinct (#81).
    expect(heading()).toHaveTextContent(copy.heading);
    expect(heading().nextElementSibling).toHaveTextContent(
      `${copy.precinct('CC007')} · ${copy.unincorporated}`,
    );
    expect(screen.getByTestId('municipality')).toHaveTextContent(copy.unincorporated);
    expect(screen.queryByRole('region', { name: copy.status.label })).toBeNull();
    expect(screen.getAllByRole('heading', { level: 2 })[0]).toHaveTextContent(
      copy.summary.electionDay,
    );
    expect(cardHeadings()).toEqual([
      copy.cards.ballot,
      copy.cards.polls,
      copy.cards.earlyVoting,
      copy.cards.districts,
    ]);
    expect(screen.queryByTestId('results-skeleton')).toBeNull();
    expect(screen.getByRole('link', { name: copy.searchAnother })).toHaveAttribute('href', '/');
  });

  it('asks each shared layer once for the summary and the cards together (#81)', async () => {
    // Thursday, October 22, 10 a.m. in Chicago: early voting runs, so the
    // summary names the nearest open site too.
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(Date.UTC(2026, 9, 22, 15)));
    routeFetch(byId);
    renderAt('CC007');
    await ready('CC007');
    const early = await screen.findByRole('region', { name: copy.summary.early });
    await within(early).findByRole('link', { name: new RegExp(copy.polls.directions) });
    await screen.findByRole('list', { name: copy.earlyVoting.listLabel });
    const pollsCalls = fetchMock.mock.calls
      .map(([input]) => new URL(input))
      .filter((url) => url.pathname.includes(election.layers.polls));
    const absentee = pollsCalls.filter(
      (url) => url.searchParams.get('where') === election.absenteeWhere,
    );
    expect(absentee).toHaveLength(1);
    expect(pollsCalls.length - absentee.length).toBe(1);
  });

  it('keeps the Election Day summary, with no sample ballot, for a precinct with nothing on the ballot (#81)', async () => {
    routeFetch(withAttributes(byId, { in_election: 'Not In Election' }));
    renderAt('CC007');
    await ready('CC007');
    const day = screen.getByRole('region', { name: copy.summary.electionDay });
    expect(day).toHaveTextContent(copy.polls.inLine(election.electionDayHours.close));
    expect(screen.queryByRole('region', { name: copy.cards.ballot })).toBeNull();
  });

  it('moves focus to the results heading when results load', async () => {
    routeFetch(byId);
    renderAt('CC007');
    await ready('CC007');
    expect(heading()).toHaveFocus();
    expect(heading()).toHaveAttribute('tabindex', '-1');
  });

  it("shows the county's message as plain text and hides the ballot card for a Nonresidential Precinct", async () => {
    routeFetch(nonresidential);
    renderAt('AP200');
    await ready('AP200');
    const banner = screen.getByRole('region', { name: copy.status.label });
    expect(banner).toHaveTextContent(nonresidential.features[0].attributes.html);
    expect(screen.getByTestId('municipality')).toHaveTextContent('City of Bridgeton');
    expect(cardHeadings()).toEqual([
      copy.cards.polls,
      copy.cards.earlyVoting,
      copy.cards.districts,
    ]);
  });

  it('never renders markup from the field', async () => {
    routeFetch(withAttributes(nonresidential, { html: 'No <b>homes</b> here.' }));
    renderAt('AP200');
    await ready('AP200');
    const banner = screen.getByRole('region', { name: copy.status.label });
    expect(banner).toHaveTextContent('No homes here.');
    expect(banner.querySelector('b')).toBeNull();
  });

  it('falls back to a plain line and the county site when the message cannot be read', async () => {
    routeFetch(withAttributes(nonresidential, { html: '<script>x</script>' }));
    renderAt('AP200');
    await ready('AP200');
    const banner = screen.getByRole('region', { name: copy.status.label });
    expect(banner).toHaveTextContent(copy.status.nonresidentialFallback);
    expect(banner).not.toHaveTextContent('script');
    expect(within(banner).getByRole('link', { name: copy.status.countySite })).toHaveAttribute(
      'href',
      election.countySiteUrl,
    );
  });

  it('says there is nothing on the ballot and hides the ballot card for a Not In Election precinct', async () => {
    routeFetch(withAttributes(byId, { in_election: 'Not In Election' }));
    renderAt('CC007');
    await ready('CC007');
    const banner = screen.getByRole('region', { name: copy.status.label });
    expect(banner).toHaveTextContent(copy.status.notInElection);
    expect(cardHeadings()).toEqual([
      copy.cards.polls,
      copy.cards.earlyVoting,
      copy.cards.districts,
    ]);
  });

  it('points to the official lookup for a status it does not know', async () => {
    routeFetch(withAttributes(byId, { in_election: 'Pending' }));
    renderAt('CC007');
    await ready('CC007');
    const banner = screen.getByRole('region', { name: copy.status.label });
    expect(banner).toHaveTextContent(copy.status.unknown);
    expect(within(banner).getByRole('link', { name: copy.officialLookup })).toHaveAttribute(
      'href',
      election.officialLookupUrl,
    );
    expect(cardHeadings()).toContain(copy.cards.ballot);
  });

  it("links the precinct's sample ballot PDF in a new tab", async () => {
    routeFetch(byId);
    renderAt('CC007');
    await ready('CC007');
    const card = screen.getByRole('region', { name: copy.cards.ballot });
    const link = within(card).getByRole('link', { name: /^Open your sample ballot/ });
    expect(link).toHaveAttribute('href', byId.features[0].attributes.html.match(/href=(\S+?)>/)[1]);
    expect(link).toHaveAttribute('target', '_blank');
    expect(link).toHaveTextContent('CC-007.pdf');
  });

  it('links the official lookup in the ballot card when the link fails validation', async () => {
    routeFetch(
      withAttributes(byId, {
        html: 'Sample Ballot: <a href=https://example.org/b.pdf>CC-007.pdf</a>',
      }),
    );
    renderAt('CC007');
    await ready('CC007');
    const card = screen.getByRole('region', { name: copy.cards.ballot });
    expect(card).toHaveTextContent(copy.ballot.missing);
    expect(within(card).getByRole('link', { name: copy.officialLookup })).toHaveAttribute(
      'href',
      election.officialLookupUrl,
    );
    expect(within(card).queryByRole('link', { name: /sample ballot/i })).toBeNull();
  });

  it("lists the precinct's districts from the county data", async () => {
    routeFetch(byId);
    renderAt('CC007');
    await ready('CC007');
    const card = screen.getByRole('region', { name: copy.cards.districts });
    const terms = [...card.querySelectorAll('dt')].map((dt) => dt.textContent);
    const values = [...card.querySelectorAll('dd')].map((dd) => dd.textContent);
    expect(terms[0]).toBe(copy.districts.labels.congressional);
    // CC007 is in District 1 on the 2022 map, which applies on November 3,
    // 2026, and District 2 on the 2025 map, which does not (#150).
    const fields = byId.features[0].attributes;
    expect(fields[election.congressionalField]).toMatch(/District 1 \(2022\)/);
    expect(fields.congressional_district_25).toMatch(/District 2 /);
    expect(values[0]).toBe('US Representative District 1');
    expect(values).not.toContain('US Representative District 2');
    expect(values).toContain(copy.unincorporated);
    expect(card).toHaveTextContent(copy.districts.source);
  });

  it('shows the districts card for a Nonresidential Precinct too', async () => {
    routeFetch(nonresidential);
    renderAt('AP200');
    await ready('AP200');
    const card = screen.getByRole('region', { name: copy.cards.districts });
    expect(within(card).getByText('City of Bridgeton Ward 1')).toBeInTheDocument();
  });

  it('shows the municipality as the data gives it, and no line when it is empty', async () => {
    routeFetch(withAttributes(byId, { municipality: '' }));
    renderAt('CC007');
    await ready('CC007');
    expect(screen.queryByText(copy.unincorporated)).toBeNull();
    expect(screen.queryByTestId('municipality')).toBeNull();
  });

  it('links each card to the official lookup until the card is built', async () => {
    routeFetch(byId);
    renderAt('CC007');
    await ready('CC007');
    const built = [
      copy.cards.polls,
      copy.cards.ballot,
      copy.cards.earlyVoting,
      copy.cards.districts,
    ];
    for (const name of cardHeadings().filter((heading) => !built.includes(heading))) {
      const card = screen.getByRole('region', { name });
      expect(within(card).getByRole('link', { name: copy.officialLookup })).toHaveAttribute(
        'href',
        election.officialLookupUrl,
      );
    }
  });

  it('lists the nearest early voting sites, from the absentee query only', async () => {
    routeFetch(byId);
    rememberLookupPoint('CC007', { lat: 38.62, lng: -90.33 });
    renderAt('CC007');
    await ready('CC007');
    const card = screen.getByRole('region', { name: copy.cards.earlyVoting });
    const list = await within(card).findByRole('list', { name: copy.earlyVoting.listLabel });
    const names = within(list)
      .getAllByRole('heading', { level: 3 })
      .map((h) => h.textContent);
    const expected = nearestPolls(absenteeSites, { lat: 38.62, lng: -90.33 })
      .slice(0, election.nearbyPollCount)
      .map((row) => row.name);
    expect(names).toEqual(expected);
    const absenteeCalls = fetchMock.mock.calls.filter(
      ([input]) => new URL(input).searchParams.get('where') === election.absenteeWhere,
    );
    expect(absenteeCalls).toHaveLength(1);
  });

  it.each(['cc007', 'Cc007'])(
    'replaces %s in the URL with the upper case code and shows that precinct',
    async (typed) => {
      routeFetch(byId);
      const location = renderAt(typed);
      await ready('CC007');
      expect(heading().nextElementSibling).toHaveTextContent(copy.precinct('CC007'));
      expect(location.history).toEqual(['/p/CC007']);
      expect(precinctCalls().every((url) => !url.search.includes(typed))).toBe(true);
    },
  );

  it.each(['%C3%9Fc007', '%C4%B1c007', '%C5%BF%C5%BF007', '%EF%AC%80007'])(
    'never turns non-ASCII letters in %s into another precinct code',
    async (typed) => {
      const location = renderAt(typed);
      expect(await screen.findByText(copy.errors.notFound, { exact: false })).toBeInTheDocument();
      expect(location.history).toEqual([`/p/${typed}`]);
      expect(fetchMock).not.toHaveBeenCalled();
    },
  );

  it('puts an out-of-county notice one level under the search heading', async () => {
    // No precinct and outside the county boundary: the City of St. Louis.
    routeFetch(precinctAtCity);
    const { GeocoderContext } = await import('./geocoderContext.js');
    const address = '1200 Market St, St. Louis, MO 63103';
    const geocoder = createFakeGeocoder([
      { label: address, lat: 38.6268, lng: -90.1994, state: 'MO', county: 'St. Louis city' },
    ]);
    render(
      <GeocoderContext.Provider value={geocoder}>
        <Router hook={memoryLocation({ path: '/p/nope' }).hook}>
          <Route path="/p/:precinct" component={PrecinctPage} />
        </Router>
      </GeocoderContext.Provider>,
    );
    await userEvent.type(await screen.findByRole('combobox'), address);
    await userEvent.keyboard('{Escape}{Enter}');

    const notice = await screen.findByRole('heading', {
      name: 'This address is in the City of St. Louis',
    });
    expect(notice.tagName).toBe('H3');
    expect(cardHeadings()).toEqual([copy.searchInstead]);
  });

  // City codes (#86): one route, the code's shape picks the City adapter. The
  // City page itself is tested in PrecinctPage.city89.test.jsx.
  describe('a City precinct code', () => {
    const cityRoot = election.jurisdictions.city.serviceRoot;
    // Every City layer answers with no rows: no such precinct.
    const answerNoCityRows = () =>
      fetchMock.mockImplementation((input) =>
        String(input).startsWith(cityRoot)
          ? respond({ features: [] })
          : Promise.reject(new Error(`Not a City layer: ${input}`)),
      );
    const onlyCityLayers = () =>
      fetchMock.mock.calls.every(([input]) => String(input).startsWith(cityRoot));

    it('reaches the City adapter, which asks no County layer', async () => {
      answerNoCityRows();
      renderAt('W01P12');
      const alert = await alertSaying(copy.errors.notFound);
      expect(fetchMock).toHaveBeenCalled();
      expect(onlyCityLayers()).toBe(true);
      // Not found, so the heading says so, as the tab title does (#81).
      expect(heading()).toHaveTextContent(copy.notFoundHeading);
      expect(document.title).toBe(copy.notFoundTitle);
      // The City board's own lookup, never the County's.
      const link = within(alert).getByRole('link', { name: copy.officialLookupFor('city') });
      expect(link).toHaveAttribute('href', referrals.stlCityLookup.url);
      expect(copy.officialLookupFor('city')).not.toBe(copy.officialLookup);
      expect(screen.getByRole('region', { name: copy.searchInstead })).toBeInTheDocument();
    });

    it.each(['w01p12', '%20W01p12%20'])(
      'replaces %s in the URL with the upper case City code',
      async (typed) => {
        answerNoCityRows();
        const location = renderAt(typed);
        await alertSaying(copy.errors.notFound);
        expect(location.history).toEqual(['/p/W01P12']);
        expect(onlyCityLayers()).toBe(true);
      },
    );

    it.each(['W1P12', 'W01P123', 'W 1 P 12'])('treats %s as malformed', async (typed) => {
      const location = renderAt(encodeURIComponent(typed));
      await alertSaying(copy.errors.notFound);
      expect(location.history).toEqual([`/p/${encodeURIComponent(typed)}`]);
      expect(fetchMock).not.toHaveBeenCalled();
    });
  });

  it('says a malformed code is not found, without a request', async () => {
    renderAt('nope');
    await alertSaying(copy.errors.notFound);
    expect(fetchMock).not.toHaveBeenCalled();
    // No result cards: only the search offered instead.
    expect(cardHeadings()).toEqual([copy.searchInstead]);
    expect(screen.getByRole('link', { name: copy.searchAnother })).toHaveAttribute('href', '/');
  });

  // #93: no jurisdiction is known for text that is not a precinct code.
  it("links both boards' lookups for text that is not a precinct code", async () => {
    renderAt('nope');
    const alert = await alertSaying(copy.errors.notFound);
    expect(within(alert).getByRole('link', { name: lookupsCopy.county })).toHaveAttribute(
      'href',
      election.officialLookupUrl,
    );
    expect(within(alert).getByRole('link', { name: lookupsCopy.city })).toHaveAttribute(
      'href',
      referrals.stlCityLookup.url,
    );
  });

  it("links only the County's lookup for a County code that is not found", async () => {
    fetchMock.mockImplementation(() => respond({ ...byId, features: [] }));
    renderAt('ZZ999');
    const alert = await alertSaying(copy.errors.notFound);
    expect(within(alert).getAllByRole('link')).toHaveLength(1);
    expect(within(alert).getByRole('link', { name: copy.officialLookup })).toHaveAttribute(
      'href',
      election.officialLookupUrl,
    );
  });

  // #93: a County voter's page names no City board, the reverse of the City
  // page's own check (PrecinctPage.city89.test.jsx).
  it('names no City board and links no City site on a County precinct page', async () => {
    routeFetch(byId);
    renderAt('CC007');
    await ready('CC007');
    await screen.findByRole('list', { name: copy.polls.listLabel });
    expect(document.body.textContent).not.toMatch(/Board of Election Commissioners/i);
    const cityHosts = [referrals.stlCityBoard.url, referrals.stlCityLookup.url].map(
      (u) => new URL(u).host,
    );
    const hosts = [...document.querySelectorAll('a[href^="http"]')].map(
      (a) => new URL(a.href).host,
    );
    for (const host of hosts) expect(cityHosts).not.toContain(host);
  });

  it.each(['nope', 'ZZ999'])(
    'offers the address search and Use my location for %s',
    async (code) => {
      fetchMock.mockImplementation(() => respond({ ...byId, features: [] }));
      renderAt(code);
      const section = await screen.findByRole('region', { name: copy.searchInstead });
      expect(within(section).getByRole('combobox')).toBeInTheDocument();
      expect(within(section).getByRole('button', { name: /use my location/i })).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: copy.share.button })).toBeNull();
    },
  );

  it('offers no search when the precinct failed to load for another reason', async () => {
    fetchMock.mockImplementation(() => respond({}, 404));
    renderAt('CC007');
    await screen.findByText(copy.errors.failed, { exact: false });
    expect(screen.queryByRole('region', { name: copy.searchInstead })).toBeNull();
  });

  it('shows the share button and note once the precinct loads', async () => {
    routeFetch(byId);
    renderAt('CC007');
    expect(screen.queryByRole('button', { name: copy.share.button })).toBeNull();
    await ready('CC007');
    expect(screen.getByRole('button', { name: copy.share.button })).toBeInTheDocument();
    expect(screen.getByText(copy.share.note('CC007'))).toBeInTheDocument();
  });

  it('titles the tab with the precinct code only, and restores the title on leaving', async () => {
    document.title = 'Before';
    routeFetch(byId);
    const location = renderAt('CC007');
    expect(document.title).toBe(copy.pageTitle('CC007'));
    await ready('CC007');
    await userEvent.click(screen.getByRole('link', { name: copy.searchAnother }));
    expect(location.history).toEqual(['/p/CC007', '/']);
    expect(document.title).toBe('Before');
  });

  it('replaces a code with spaces around it with the bare code', async () => {
    routeFetch(byId);
    const location = renderAt('%20cc007%20');
    await ready('CC007');
    expect(location.history).toEqual(['/p/CC007']);
  });

  it('titles a code that is not found as not found, without the code (#26)', async () => {
    document.title = 'Before';
    fetchMock.mockImplementation(() => respond({ ...byId, features: [] }));
    const { unmount } = render(
      <Router hook={memoryLocation({ path: '/p/ZZ999' }).hook}>
        <Route path="/p/:precinct" component={PrecinctPage} />
      </Router>,
    );
    await screen.findByRole('region', { name: copy.searchInstead });
    expect(document.title).toBe(copy.notFoundTitle);
    expect(document.title).not.toContain('ZZ999');
    unmount();
    expect(document.title).toBe('Before');
  });

  it('keeps focus on "Search another address" when a load it was focused during ends in not found', async () => {
    let answer;
    fetchMock.mockImplementation(
      () =>
        new Promise((resolve) => {
          answer = () => resolve(respond({ ...byId, features: [] }));
        }),
    );
    renderAt('ZZ999');
    const link = screen.getByRole('link', { name: copy.searchAnother });
    link.focus();
    answer();
    await screen.findByRole('region', { name: copy.searchInstead });
    expect(screen.getByRole('link', { name: copy.searchAnother })).toHaveFocus();
  });

  it('titles URL text that is not a precinct code as not found, never echoing it', async () => {
    document.title = 'Before';
    renderAt('Polls%20moved');
    await screen.findByRole('region', { name: copy.searchInstead });
    expect(document.title).toBe(copy.notFoundTitle);
    expect(document.title).not.toContain('Polls');
  });

  it('never puts URL text that is not a precinct code in the heading', async () => {
    renderAt('Polls%20moved%20to%20City%20Hall');
    expect(heading()).toHaveTextContent(copy.notFoundHeading);
    expect(heading()).not.toHaveTextContent(/polls|city hall/i);
    await alertSaying(copy.errors.notFound);
    expect(heading()).not.toHaveTextContent(/polls|city hall/i);
  });

  it('says an unknown code is not found', async () => {
    fetchMock.mockImplementation(() => respond({ ...byId, features: [] }));
    renderAt('ZZ999');
    await alertSaying(copy.errors.notFound);
    expect(liveRegion()).toHaveTextContent(/^$/);
  });

  it('says a failed load failed, with the official lookup link', async () => {
    fetchMock.mockImplementation(() => respond({}, 404));
    renderAt('CC007');
    const alert = await alertSaying(copy.errors.failed);
    expect(within(alert).getByRole('link', { name: copy.officialLookup })).toHaveAttribute(
      'href',
      election.officialLookupUrl,
    );
    expect(screen.queryByTestId('results-skeleton')).toBeNull();
  });

  it('keeps the skeleton through the retry of a server error, then says it failed', async () => {
    fetchMock.mockImplementation(() => respond({}, 500));
    renderAt('CC007');
    expect(screen.getByTestId('results-skeleton')).toBeInTheDocument();
    await alertSaying(copy.errors.failed);
    const byIdCalls = precinctCalls().filter((url) => url.searchParams.get('f') === 'json');
    expect(byIdCalls).toHaveLength(2);
    expect(screen.queryByTestId('results-skeleton')).toBeNull();
  });

  it('keeps the URL to the precinct code and stores nothing', async () => {
    localStorage.clear();
    sessionStorage.clear();
    routeFetch(byId);
    const location = renderAt('CC007');
    await ready('CC007');
    expect(location.history).toEqual(['/p/CC007']);
    expect(localStorage).toHaveLength(0);
    expect(sessionStorage).toHaveLength(0);
  });

  it('lists polling places by distance from the looked-up point', async () => {
    const point = { lat: 38.66, lng: -90.45 };
    rememberLookupPoint('CC007', point);
    routeFetch(byId);
    renderAt('CC007');
    const card = await screen.findByRole('region', { name: copy.cards.polls });
    const list = await within(card).findByRole('list', { name: copy.polls.listLabel });
    const expected = nearestPolls(polls, point).slice(0, election.nearbyPollCount);
    expect(
      within(list)
        .getAllByRole('heading', { level: 3 })
        .map((h) => h.textContent),
    ).toEqual(expected.map((row) => row.name));
    expect(within(card).queryByText(copy.polls.fromCenter('CC007'))).toBeNull();
    // The outline is only needed without a point.
    expect(precinctCalls().filter((url) => url.searchParams.get('f') === 'geojson')).toEqual([]);
  });

  it("lists polling places from the precinct's center when opened from a link", async () => {
    rememberLookupPoint('OAK019', { lat: 38.5, lng: -90.3 });
    routeFetch(byId);
    renderAt('CC007');
    const card = await screen.findByRole('region', { name: copy.cards.polls });
    const list = await within(card).findByRole('list', { name: copy.polls.listLabel });
    const center = polygonCenter(precinctGeometry.features[0].geometry);
    const expected = nearestPolls(polls, center).slice(0, election.nearbyPollCount);
    expect(
      within(list)
        .getAllByRole('heading', { level: 3 })
        .map((h) => h.textContent),
    ).toEqual(expected.map((row) => row.name));
    // Said once, in the summary at the top (#81).
    expect(screen.getAllByText(copy.polls.fromCenter('CC007'))).toHaveLength(1);
  });

  it('never puts the looked-up point in a request, the URL or storage', async () => {
    localStorage.clear();
    sessionStorage.clear();
    rememberLookupPoint('CC007', { lat: 38.661234, lng: -90.451234 });
    routeFetch(byId);
    const location = renderAt('CC007');
    await screen.findByRole('list', { name: copy.polls.listLabel });
    const seen = [
      ...fetchMock.mock.calls.map(([input]) => String(input)),
      ...location.history,
      JSON.stringify(window.history.state),
      JSON.stringify({ ...localStorage }),
      JSON.stringify({ ...sessionStorage }),
    ].join(' ');
    for (const needle of ['38.661234', '90.451234', '38.66', '90.45']) {
      expect(seen).not.toContain(needle);
    }
  });

  it('goes back to the search from "Search another address"', async () => {
    routeFetch(byId);
    const location = renderAt('CC007');
    await ready('CC007');
    await userEvent.click(screen.getByRole('link', { name: copy.searchAnother }));
    expect(location.history).toEqual(['/p/CC007', '/']);
  });

  // #186: a request one test starts must never reach a later test's fetch
  // stub. A failed line count request is retried RETRY_DELAY_MS later, after
  // the page that asked has gone; most tests here end well before that. The
  // two tests run in this order (the file's tests run in order, no shuffle).
  describe('between tests (#186)', () => {
    const { county, city } = election.waitTimes;
    const isWaitLayer = (input) =>
      [county, city].some((s) => String(input).startsWith(`${s.serviceRoot}/${s.layer}/`));

    it('ends while a failed line count request waits for its retry', async () => {
      // While early voting sites are open, so the page asks for line counts.
      vi.useFakeTimers({ toFake: ['Date'] });
      vi.setSystemTime(new Date(Date.UTC(2026, 9, 22, 15)));
      routeFetch(byId);
      const answer = fetchMock.getMockImplementation();
      fetchMock.mockImplementation((input) =>
        isWaitLayer(input) ? respond({}, 500) : answer(input),
      );
      renderAt('CC007');
      await ready('CC007');
      expect(fetchMock.mock.calls.some(([input]) => isWaitLayer(input))).toBe(true);
    });

    it('gets no request from the test before', async () => {
      renderAt('nope');
      await alertSaying(copy.errors.notFound);
      await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY_MS + 100));
      expect(fetchMock).not.toHaveBeenCalled();
    });
  });
});
