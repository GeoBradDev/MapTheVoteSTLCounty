// The City districts card (#90): the real City client with fetch stubbed, the
// precinct outline from its recorded fixture and the districts layer from its
// recorded answer (or an answer built here). Field names come from the config:
// the hardcoding test scans this file.
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import districtsAtPoint from '../../../docs/raw/fixtures/city-districts-at-point.json';
import cityGeometry from '../../../docs/raw/fixtures/city-precinct-geometry.json';
import election from '../../config/election.js';
import referrals from '../../config/referrals.js';
import { interiorPoint } from '../../data/interiorPoint.js';
import { copy } from './resultsCopy.js';
import { unmountThenUnstub } from '../../test/teardown.js';

const city = election.jurisdictions.city;
const fields = city.districtLayerFields;
const CODE = 'W01P12';

let fetchMock;
let modules;

function respond(body, status = 200) {
  return Promise.resolve(new Response(JSON.stringify(body), { status }));
}

// A districts layer answer with these rows, each `[office, district]`, plus
// any other attributes given.
function answer(rows, extra = {}) {
  return {
    features: rows.map(([office, name]) => ({
      attributes: { [fields.office]: office, [fields.name]: name, [fields.id]: name, ...extra },
    })),
  };
}

// The precinct layer answers its outline; the districts layer `districts`
// (a body, or a function of the call count), or 500 with `fail`.
function routeFetch({ districts = districtsAtPoint, fail = false } = {}) {
  let asked = 0;
  fetchMock.mockImplementation((input) => {
    const url = new URL(input);
    if (!url.href.startsWith(city.serviceRoot)) throw new Error(`Not a City layer: ${url.href}`);
    if (url.pathname.includes(city.layers.districts)) {
      asked += 1;
      const failNow = typeof fail === 'function' ? fail(asked) : fail;
      return failNow ? respond({ error: 'down' }, 500) : respond(districts);
    }
    return respond(cityGeometry);
  });
}

beforeEach(async () => {
  fetchMock = vi.fn();
  vi.stubGlobal('fetch', fetchMock);
  vi.resetModules();
  modules = {
    Card: (await import('./CityDistrictsCard.jsx')).default,
    ...(await import('./jurisdictionContext.js')),
    ...(await import('../../data/jurisdictions.js')),
  };
});

afterEach(async () => {
  await unmountThenUnstub();
});

function renderCard() {
  const { Card, JurisdictionContext, city: adapter } = modules;
  render(
    <JurisdictionContext.Provider value={adapter}>
      <section aria-label="card">
        <Card code={CODE} />
      </section>
    </JurisdictionContext.Provider>,
  );
  return screen.getByRole('region', { name: 'card' });
}

const loaded = () => screen.findByText(copy.districts.sourceCity);

// Each row's label and value, in order.
function rowsOf(card) {
  return [...card.querySelectorAll('dt')].map((dt) => [dt.textContent, dt.nextSibling.textContent]);
}

// The districts query's parameters (a POST, so from its body).
function districtQueries() {
  return fetchMock.mock.calls
    .filter(([input]) => new URL(input).pathname.includes(city.layers.districts))
    .map(([, init]) => Object.fromEntries(init.body));
}

describe('CityDistrictsCard', () => {
  it('shows a placeholder while it loads', () => {
    fetchMock.mockImplementation(() => new Promise(() => {}));
    renderCard();
    expect(screen.getByTestId('districts-skeleton')).toBeInTheDocument();
  });

  it('lists a precinct in one ward and district set, in order, with the source line', async () => {
    routeFetch();
    const card = renderCard();
    await loaded();
    expect(rowsOf(card)).toEqual([
      [copy.districts.labels.congressional, 'First District'],
      [copy.districts.labels.stateSenate, 'Missouri Senate District 5'],
      [copy.districts.labels.stateHouse, 'Missouri House District 78'],
      [copy.districts.labels.cityWard, 'Ward 14'],
      [copy.districts.labels.juniorCollege, 'Community College Trustee Subdistrict 2'],
      [copy.districts.labels.school, 'Board of Education for the City of St. Louis'],
    ]);
    expect(copy.districts.sourceCity).toBe(
      "From the St. Louis City Board of Election Commissioners' election data.",
    );
    expect(card).not.toHaveTextContent(copy.districts.multipleCity);
  });

  it('asks at a point inside the precinct outline, never with the outline itself', async () => {
    routeFetch();
    renderCard();
    await loaded();
    const [params] = districtQueries();
    expect(params.geometryType).toBe('esriGeometryPoint');
    const point = interiorPoint(cityGeometry.features[0].geometry);
    expect(params.geometry).toBe(`${point.lng},${point.lat}`);
  });

  it('lists both districts, and says so, when the answer has two for one office', async () => {
    routeFetch({
      districts: answer([
        ['State House Representative', 'Missouri House District 78'],
        ['State House Representative', 'Missouri House District 79'],
        ['Alderman', 'Ward 14'],
      ]),
    });
    const card = renderCard();
    await loaded();
    expect(rowsOf(card)).toEqual([
      [copy.districts.labels.stateHouse, 'Missouri House District 78, Missouri House District 79'],
      [copy.districts.labels.cityWard, 'Ward 14'],
    ]);
    expect(card).toHaveTextContent(copy.districts.multipleCity);
    const link = within(card).getByRole('link', { name: copy.officialLookupFor('city') });
    expect(link).toHaveAttribute('href', referrals.stlCityLookup.url);
  });

  it('says the districts are missing when the answer has none it lists', async () => {
    routeFetch({ districts: answer([['Mayor', 'City of St. Louis']]) });
    const card = renderCard();
    await screen.findByText(copy.districts.missing, { exact: false });
    expect(card.querySelector('dl')).toBeNull();
    const link = within(card).getByRole('link', { name: copy.officialLookupFor('city') });
    expect(link).toHaveAttribute('href', referrals.stlCityLookup.url);
  });

  it('says the districts are missing for an empty answer', async () => {
    routeFetch({ districts: { features: [] } });
    renderCard();
    expect(await screen.findByText(copy.districts.missing, { exact: false })).toBeInTheDocument();
  });

  it('says the districts are missing, with no Try again, when the precinct is not found', async () => {
    fetchMock.mockImplementation(() => respond({ type: 'FeatureCollection', features: [] }));
    const card = renderCard();
    expect(await screen.findByText(copy.districts.missing, { exact: false })).toBeInTheDocument();
    expect(within(card).queryByRole('button')).toBeNull();
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('says it could not load them on a failure, and loads them on Try again', async () => {
    // The client tries twice before it gives up.
    routeFetch({ fail: (n) => n <= 2 });
    const card = renderCard();
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent(copy.districts.failed);
    expect(
      within(alert).getByRole('link', { name: copy.officialLookupFor('city') }),
    ).toHaveAttribute('href', referrals.stlCityLookup.url);
    await userEvent.click(within(card).getByRole('button'));
    await loaded();
    expect(screen.queryByRole('alert')).toBeNull();
    expect(rowsOf(card)).toHaveLength(6);
    // Focus moves to the districts, not the page's start.
    expect(card.contains(document.activeElement)).toBe(true);
  });

  it('leaves focus where the voter moved it while a retry ran', async () => {
    let release;
    let asked = 0;
    fetchMock.mockImplementation((input) => {
      const url = new URL(input);
      if (!url.pathname.includes(city.layers.districts)) return respond(cityGeometry);
      asked += 1;
      if (asked <= 2) return respond({ error: 'down' }, 500);
      return new Promise((resolve) => {
        release = () => resolve(new Response(JSON.stringify(districtsAtPoint)));
      });
    });
    const { Card, JurisdictionContext, city: adapter } = modules;
    render(
      <JurisdictionContext.Provider value={adapter}>
        <section aria-label="card">
          <Card code={CODE} />
        </section>
        <button type="button">Elsewhere</button>
      </JurisdictionContext.Provider>,
    );
    const card = screen.getByRole('region', { name: 'card' });
    await screen.findByRole('alert');
    await userEvent.click(within(card).getByRole('button'));
    await waitFor(() => expect(release).toBeTypeOf('function'));
    const elsewhere = screen.getByRole('button', { name: 'Elsewhere' });
    elsewhere.focus();
    release();
    await loaded();
    expect(document.activeElement).toBe(elsewhere);
  });

  it('never lets officeholder, party or contact text reach the page', async () => {
    const extra = {
      repname1: 'Pat Example',
      party1: 'Democratic',
      party2: 'Republican',
      phone1: '314-555-0100',
      email1: 'pat@example.com',
      facebook1: 'https://facebook.com/pat',
      // The officeholder's address field shares the voting locations' address name.
      [`${city.siteFields.address}1`]: '1200 Market St',
      repimageurl1: 'https://example.com/pat.jpg',
    };
    routeFetch({
      districts: answer(
        [
          ['Alderman', 'Ward 14'],
          ['Committeeman (R)', 'Ward 14 Republican Committee'],
          ['Committeewoman (D)', 'Ward 14'],
          ['State Senate', 'Missouri Senate District 5 (D)'],
        ],
        extra,
      ),
    });
    const card = renderCard();
    await loaded();
    expect(rowsOf(card)).toEqual([[copy.districts.labels.cityWard, 'Ward 14']]);
    const text = card.textContent;
    for (const value of [...Object.values(extra), 'Committee', 'Alderman', '(R)', '(D)']) {
      expect(text).not.toContain(value);
    }
    expect(card.querySelector('img')).toBeNull();
    // Nor asked for.
    for (const params of districtQueries()) {
      expect(params.outFields.split(',').sort()).toEqual(Object.values(fields).sort());
    }
  });

  it('shows no office name, only the district', async () => {
    routeFetch();
    const card = renderCard();
    await loaded();
    const offices = districtsAtPoint.features.map(({ attributes }) => attributes[fields.office]);
    const values = rowsOf(card).map(([, value]) => value);
    for (const office of offices) expect(values).not.toContain(office);
    expect(card).not.toHaveTextContent('Alderman');
  });
});

// Owner decision on #81: folded away on phones, open on wider screens.
describe('CityDistrictsCard on phones and wide screens', () => {
  const screenWidth = (width) =>
    vi.stubGlobal('matchMedia', (query) => ({
      matches: query === '(min-width: 640px)' && width >= 640,
    }));
  const details = () => document.querySelector('dl').closest('details');

  it('starts folded on a phone', async () => {
    screenWidth(360);
    routeFetch();
    renderCard();
    await loaded();
    expect(details()).not.toHaveAttribute('open');
    expect(screen.getByText(copy.districts.show).tagName).toBe('SUMMARY');
  });

  it('starts open on a wide screen', async () => {
    screenWidth(1280);
    routeFetch();
    renderCard();
    await loaded();
    expect(details()).toHaveAttribute('open');
  });
});

// #70: its official lookup link and Try again are counted as districts, with
// no ward, district or code. The analytics module is the copy the card was
// imported with (vi.resetModules above).
describe('CityDistrictsCard analytics (#70)', () => {
  it('counts the City lookup link and Try again', async () => {
    const { trackEvents, pressLink } = await import('../../test/trackedEvents.js');
    const tracked = trackEvents();
    try {
      routeFetch({ fail: (n) => n <= 2 });
      const card = renderCard();
      const alert = await screen.findByRole('alert');
      expect(await pressLink(userEvent.click, within(alert).getByRole('link'))).toBe(false);
      await userEvent.click(within(card).getByRole('button'));
      await loaded();
      expect(await tracked.events()).toEqual([
        ['official_lookup_open', { card: 'districts' }],
        ['retry', { where: 'districts' }],
      ]);
      expect(JSON.stringify(tracked.calls())).not.toMatch(/W01P12|Ward|District \d/);
    } finally {
      tracked.stop();
    }
  });
  it('counts the City lookup link when the districts are missing', async () => {
    const { trackEvents, pressLink } = await import('../../test/trackedEvents.js');
    const tracked = trackEvents();
    try {
      routeFetch({ districts: { features: [] } });
      renderCard();
      await screen.findByText(copy.districts.missing, { exact: false });
      const link = screen.getByRole('link', { name: copy.officialLookupFor('city') });
      expect(await pressLink(userEvent.click, link)).toBe(false);
      expect(await tracked.events()).toEqual([['official_lookup_open', { card: 'districts' }]]);
    } finally {
      tracked.stop();
    }
  });
});
