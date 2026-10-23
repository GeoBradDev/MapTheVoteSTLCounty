// The City results page (#89): /p/<City code> shows the City's polling places,
// the City Board's Election Day rule and City links, with no County text. The
// real data clients run against a stubbed fetch answering from the recorded
// City fixtures.
import { configure, getConfig, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Route, Router } from 'wouter';
import { memoryLocation } from 'wouter/memory-location';
import cityEarlySites from '../../../docs/raw/fixtures/city-early-voting-sites.json';
import cityPolls from '../../../docs/raw/fixtures/city-polls.json';
import cityById from '../../../docs/raw/fixtures/city-precinct-by-id.json';
import cityDistricts from '../../../docs/raw/fixtures/city-districts-at-point.json';
import cityGeometry from '../../../docs/raw/fixtures/city-precinct-geometry.json';
import cityResults from '../../config/cityResults.js';
import election from '../../config/election.js';
import referrals from '../../config/referrals.js';
import { formatLongDate } from './earlyVoting.js';
import { copy as errorCopy } from './errorCopy.js';
import { copy as countyRuleCopy } from './countyElectionDayRuleCopy.js';
import { nearestPolls, polygonCenter } from './nearbyPolls.js';
import { copy } from './resultsCopy.js';

const CODE = 'W01P12';
const city = election.jurisdictions.city;
const rule = cityResults.electionDayRule;

let fetchMock;
let PrecinctPage;

function respond(body, status = 200) {
  return Promise.resolve(new Response(JSON.stringify(body), { status }));
}

const empty = { features: [] };

// Answers the City layers from their fixtures; `fail` names layers that answer
// 500 instead. Anything else (a County layer) fails the test.
function routeFetch({ fail = [] } = {}) {
  fetchMock.mockImplementation((input) => {
    const url = new URL(input);
    if (!url.href.startsWith(city.serviceRoot)) throw new Error(`Not a City layer: ${url.href}`);
    const key = url.pathname.includes(city.layers.sites)
      ? 'sites'
      : url.pathname.includes(city.layers.districts)
        ? 'districts'
        : 'precincts';
    if (fail.includes(key)) return respond({ error: 'down' }, 500);
    if (key === 'districts') return respond(cityDistricts);
    if (key === 'sites') {
      const early = url.searchParams.get('where') === city.earlyVotingWhere;
      return respond(early ? cityEarlySites : cityPolls);
    }
    const asked = url.searchParams.get('where') ?? '';
    if (!asked.includes(cityById.features[0].attributes[city.precinctField])) return respond(empty);
    return respond(url.searchParams.get('f') === 'geojson' ? cityGeometry : cityById);
  });
}

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
});

afterEach(() => {
  vi.unstubAllGlobals();
});

function renderAt(code) {
  const location = memoryLocation({ path: `/p/${code}`, record: true });
  render(
    <Router hook={location.hook}>
      <Route path="/p/:precinct" component={PrecinctPage} />
    </Router>,
  );
}

const ready = (code) => screen.findByText(copy.ready(code));
const pollsCard = () => screen.getByRole('region', { name: copy.cards.polls });

async function alertSaying(text) {
  const holding = () =>
    screen
      .getAllByRole('alert')
      .filter((alert) => alert.textContent.replace(/\s+/g, ' ').includes(text));
  await waitFor(() => expect(holding(), `one alert saying "${text}"`).toHaveLength(1));
  return holding()[0];
}

describe('a City precinct page (#89)', () => {
  it('names the ward and precinct, with no status banner', async () => {
    routeFetch();
    renderAt(CODE);
    await ready(CODE);
    const h1 = screen.getByRole('heading', { level: 1 });
    expect(h1).toHaveTextContent(copy.heading);
    expect(h1.nextElementSibling).toHaveTextContent(copy.precinct(CODE));
    expect(screen.getByTestId('municipality')).toHaveTextContent(
      copy.cityPrecinct(city.name, 1, 12),
    );
    expect(screen.getByTestId('municipality')).toHaveTextContent('Ward 1, Precinct 12');
    expect(screen.queryByRole('region', { name: copy.status.label })).toBeNull();
    expect(document.title).toBe(copy.pageTitle(CODE));
  });

  it('lists the nearest City polling places from the precinct center, with entrances', async () => {
    routeFetch();
    renderAt(CODE);
    const list = await screen.findByRole('list', { name: copy.polls.listLabel });
    // The client's shape, as nearestPolls reads it.
    const { getCityPolls } = await import('../../data/cityArcgis.js');
    const expected = nearestPolls(
      await getCityPolls(),
      polygonCenter(cityGeometry.features[0].geometry),
    );
    const names = within(list)
      .getAllByRole('heading', { level: 3 })
      .map((h) => h.textContent);
    expect(names).toEqual(expected.slice(0, election.nearbyPollCount).map((p) => p.name));
    const first = expected[0];
    const row = within(list).getAllByRole('listitem')[0];
    expect(row).toHaveTextContent(first.address);
    const entrance =
      first.entry === first.accessibleEntry
        ? copy.polls.entryBoth(first.entry)
        : copy.polls.accessibleEntry(first.accessibleEntry);
    expect(row).toHaveTextContent(entrance);
    // Said once, in the summary at the top (#81).
    expect(screen.getAllByText(copy.polls.fromCenter(CODE))).toHaveLength(1);
    expect(pollsCard()).toHaveTextContent(copy.polls.nearestNoteCity);
    expect(pollsCard()).not.toHaveTextContent(copy.polls.nearestNote);

    await userEvent.click(within(pollsCard()).getByRole('button', { name: copy.polls.showMore }));
    expect(within(list).getAllByRole('listitem')).toHaveLength(election.nearbyPollCount * 2);
  });

  it("quotes the City Board's Election Day rule with its source and date, not the County's", async () => {
    routeFetch();
    renderAt(CODE);
    await screen.findByRole('list', { name: copy.polls.listLabel });
    const card = pollsCard();
    expect(card).toHaveTextContent(rule.quote);
    const source = within(card).getByRole('link', {
      name: copy.polls.sourceNames['www.stlouis-mo.gov'],
    });
    expect(source).toHaveAttribute('href', referrals[rule.source].url);
    expect(card).toHaveTextContent(
      copy.earlyVoting.lastVerified(formatLongDate(rule.lastVerified, { year: true })),
    );
    // Nothing of the County's rule: no phone number, no Secretary of State lookup.
    expect(card).not.toHaveTextContent(election.electionDayPollingPlace.phone);
    expect(within(card).queryByRole('link', { name: /secretary of state/i })).toBeNull();
    expect(card.querySelector(`a[href="${referrals.moVoterOutreach.url}"]`)).toBeNull();
    // Nor the County's own rule or its source (#152).
    expect(card).not.toHaveTextContent(countyRuleCopy.rule);
    expect(card).not.toHaveTextContent(countyRuleCopy.cityNote);
    for (const url of election.electionDayPollingPlace.sources) {
      expect(card.querySelector(`a[href="${url}"]`)).toBeNull();
    }
  });

  it('shows no County text, and links only City and statewide sources', async () => {
    routeFetch();
    renderAt(CODE);
    await screen.findByRole('list', { name: copy.polls.listLabel });
    const main = document.body;
    expect(main.textContent).not.toMatch(/county/i);
    const hosts = [...main.querySelectorAll('a[href^="http"]')].map((a) => new URL(a.href).host);
    const county = [election.officialLookupUrl, election.countySiteUrl].map((u) => new URL(u).host);
    for (const host of hosts) expect(county).not.toContain(host);
  });

  it('shows the City sample ballot card: the citywide PDF, never a precinct ballot (#92)', async () => {
    routeFetch();
    renderAt(CODE);
    await ready(CODE);
    const card = () => screen.getByRole('region', { name: copy.cards.ballot });
    await waitFor(() => expect(card()).toHaveTextContent(copy.ballot.introCity));
    const links = [...card().querySelectorAll('a[href]')].map((a) => a.getAttribute('href'));
    expect(links).toEqual([cityResults.sampleBallot.url, cityResults.sampleBallot.sources[0]]);
    // Not the County card's words or its precinct PDF link.
    expect(card()).not.toHaveTextContent(copy.ballot.open);
    expect(card().querySelector('a[href*="/sharing/rest/content/items/"]')).toBeNull();
  });

  it('shows the City districts card: the districts layer names, with its source (#90)', async () => {
    routeFetch();
    renderAt(CODE);
    const card = () => screen.getByRole('region', { name: copy.cards.districts });
    await waitFor(() => expect(card()).toHaveTextContent(copy.districts.sourceCity));
    expect(within(card()).getByText(copy.districts.labels.cityWard)).toBeInTheDocument();
    expect(card()).toHaveTextContent('Missouri House District 78');
    expect(card().querySelector(`a[href="${referrals.stlCityBoard.url}"]`)).toBeNull();
  });

  it('asks only the City layers, the early voting sites with their own filter (#91)', async () => {
    routeFetch();
    renderAt(CODE);
    await screen.findByRole('list', { name: copy.polls.listLabel });
    await screen.findByRole('list', { name: copy.earlyVoting.listLabel });
    const urls = fetchMock.mock.calls.map(([input]) => new URL(input));
    expect(urls.length).toBeGreaterThan(0);
    // Its line counts too (the City card's own loop asks only the City layer).
    for (const url of urls) expect(url.href.startsWith(city.serviceRoot), url.href).toBe(true);
    const wheres = urls.map((url) => url.searchParams.get('where'));
    expect(wheres).toContain(city.earlyVotingWhere);
    expect(wheres).toContain(city.pollsWhere);
  });

  it('shows the City early voting card: the nearest City sites with their hours (#91)', async () => {
    routeFetch();
    renderAt(CODE);
    const card = () => screen.getByRole('region', { name: copy.cards.earlyVoting });
    const list = await screen.findByRole('list', { name: copy.earlyVoting.listLabel });
    expect(card()).toContainElement(list);
    expect(list.children).toHaveLength(election.nearbyPollCount);
    const names = cityEarlySites.features.map((f) => f.properties.name);
    for (const row of list.children) {
      expect(names).toContain(within(row).getByRole('heading', { level: 3 }).textContent);
    }
    expect(card()).toHaveTextContent(copy.earlyVoting.groupsLabel);
    // No link to the City Board's home page in this card.
    expect(card().querySelector(`a[href="${referrals.stlCityBoard.url}"]`)).toBeNull();
  });

  it('shows the failure state with the City lookup when the City precincts fail', async () => {
    routeFetch({ fail: ['precincts'] });
    renderAt(CODE);
    const alert = await alertSaying(copy.errors.failed);
    expect(alert).not.toHaveTextContent(/county/i);
    const link = within(alert).getByRole('link', { name: copy.officialLookupFor('city') });
    expect(link).toHaveAttribute('href', referrals.stlCityLookup.url);
    expect(screen.getByRole('button', { name: errorCopy.retry })).toBeInTheDocument();
  });

  it('shows the polling places failure with the City lookup when the sites fail', async () => {
    routeFetch({ fail: ['sites'] });
    renderAt(CODE);
    const alert = await alertSaying(copy.polls.failed);
    const link = within(alert).getByRole('link', { name: copy.officialLookupFor('city') });
    expect(link).toHaveAttribute('href', referrals.stlCityLookup.url);
    expect(within(pollsCard()).getByRole('button', { name: errorCopy.retry })).toBeInTheDocument();
    expect(pollsCard()).toHaveTextContent(rule.quote);
  });

  it('says an unknown City code is not found, with the City lookup', async () => {
    routeFetch();
    renderAt('W99P99');
    const alert = await alertSaying(copy.errors.notFound);
    const link = within(alert).getByRole('link', { name: copy.officialLookupFor('city') });
    expect(link).toHaveAttribute('href', referrals.stlCityLookup.url);
  });
});
