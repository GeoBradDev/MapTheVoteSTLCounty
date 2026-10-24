import { render, screen, within } from '@testing-library/react';
import { ANALYTICS_HOSTS } from '../../analytics/index.js';
import election from '../../config/election.js';
import PrivacyPage from './PrivacyPage.jsx';
import { copy, hosts } from './privacyCopy.js';
import { connectOrigins, namedHosts } from '../../test/privacyNotice.js';

// The notice with Google Analytics off, as it ships (owner decision on #69),
// whatever the config holds: PrivacyPage.analytics.test.jsx checks it on.
vi.mock('../../config/site.js', async (importOriginal) => ({
  ...(await importOriginal()),
  gaMeasurementId: '',
}));

function section(name) {
  return screen.getByRole('region', { name });
}

describe('PrivacyPage', () => {
  it('has one heading and the sections in plain language', () => {
    render(<PrivacyPage />);

    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Privacy');
    for (const name of [copy.never.heading, copy.sent.heading, copy.links.heading]) {
      expect(section(name)).toBeInTheDocument();
    }
  });

  // #93: the notice is for City and County voters alike.
  it("names the election boards' sites, not only the county's, under links", () => {
    render(<PrivacyPage />);
    const links = section(copy.links.heading);
    expect(links).toHaveTextContent(/election boards'/);
    expect(links).not.toHaveTextContent(/county/i);
  });

  // A new third party in the policy means a new place data goes: the notice
  // must say so in the same change. Google Analytics' hosts (#69) are named
  // once its measurement ID is set (PrivacyPage.analytics.test.jsx); while it
  // is empty nothing goes there, and the notice says the site has no analytics.
  it('names every third-party origin the Content-Security-Policy allows but analytics', async () => {
    render(<PrivacyPage />);
    const named = namedHosts(section(copy.sent.heading).textContent);
    const analytics = Object.values(ANALYTICS_HOSTS);
    const origins = (await connectOrigins()).map((origin) => new URL(origin).host);

    expect(origins.length).toBeGreaterThan(0);
    expect(origins).toEqual(expect.arrayContaining(analytics));
    for (const host of origins.filter((h) => !analytics.includes(h))) {
      expect(named).toContain(host);
    }
  });

  // The measurement ID is empty as shipped (owner decision on #69).
  it('says the site has no analytics while the measurement ID is empty', () => {
    render(<PrivacyPage />);
    expect(screen.getByText(copy.intro)).toHaveTextContent('no analytics');
    expect(section(copy.never.heading)).toHaveTextContent('no analytics, ads or tracking');
    expect(document.body).not.toHaveTextContent(/Google|googletagmanager|google-analytics/);
  });

  it('names the election maps host from the election config', () => {
    expect(hosts.electionMaps).toBe(new URL(election.serviceRoot).host);
  });

  // The wait times page (#104): both boards' layers, the refresh rate and
  // nothing about the voter, all from the config.
  it('says what the wait times page asks, from the config', () => {
    render(<PrivacyPage />);
    const { county, city, refreshSeconds } = election.waitTimes;
    const item = screen.getByRole('heading', { name: 'Line counts' }).parentElement;
    for (const text of [
      county.source,
      city.source,
      new URL(county.serviceRoot).host,
      new URL(city.serviceRoot).host,
      `every ${refreshSeconds} seconds`,
      'carry nothing about you',
      // The results page's early voting card asks them too (#105).
      "the early voting part of a precinct's results while early voting is running",
      // And on Election Day, the polling places card, its own board's only (#107).
      "on Election Day, that page and the polling places part of a precinct's results",
      "only its own board's layer",
      new URL(county.electionDay.serviceRoot).host,
    ]) {
      expect(item).toHaveTextContent(text);
    }
  });

  it('says where the typed address goes: the county service, Photon and the City check', () => {
    render(<PrivacyPage />);
    const item = within(section(copy.sent.heading))
      .getByRole('heading', { name: 'Address search' })
      .closest('div');

    expect(item).toHaveTextContent(
      "goes first to St. Louis County's address points (maps.stlouisco.com), or to the county's copy of them on Esri's ArcGIS Online (services2.arcgis.com) when the first cannot be reached. The county gets it in the body of the request, not in its web address.",
    );
    expect(item).toHaveTextContent(
      "When the county has no match, it also goes to the City of St. Louis's address search (maps6.stlouis-mo.gov), in the body of the request, to find it in St. Louis City.",
    );
    expect(item).toHaveTextContent(
      'It also goes to Photon by komoot (photon.komoot.io) when neither has a match or the county cannot be reached;',
    );
    expect(item).toHaveTextContent(
      "its house number and street (not the town, ZIP code or unit) also go to the City's address search, in the body of the request, to check that the City does not have the same address. The City is skipped when you typed a ZIP code that is entirely outside the City, or picked a suggestion with one, or when the address was found in another county.",
    );
    // City suggestions (#88): the City gets the text as it is typed too.
    expect(item).toHaveTextContent(
      'so the county, Photon and, once a house number and a street name are typed, the City get each part of the address as you type it.',
    );
    expect(item).not.toHaveTextContent('not also in St. Louis City');
  });

  // Issue #38: the point queries POST the coordinates in the request body,
  // uncached. The notice must say so, and must not keep the old caveat.
  it('says the coordinates go in the body of the request and are not cached', () => {
    render(<PrivacyPage />);
    const item = within(section(copy.sent.heading))
      .getByRole('heading', { name: 'Finding your precinct' })
      .closest('div');

    expect(item).toHaveTextContent(
      "goes to St. Louis County's election maps on Esri's ArcGIS Online (services6.arcgis.com), in the body of the request, not in its web address",
    );
    expect(item).toHaveTextContent(
      "When it is in or near the City of St. Louis, it goes the same way to the St. Louis City Board of Election Commissioners' election maps (services6.arcgis.com), also on Esri's ArcGIS Online. An address the address search places in the City goes there first, and to the county's maps too only if the City has no precinct for it or cannot be reached.",
    );
    expect(item).toHaveTextContent(
      'Your browser does not keep these requests or their answers in its cache.',
    );
    expect(item).toHaveTextContent(
      "the points of all of them go to the county's election maps first, the same way, to check that they are in one precinct",
    );
    expect(item).toHaveTextContent(
      // The City districts card (#90) asks at a point from the precinct's outline.
      "Opening a shared link sends only the precinct code to the election maps of its own board. A City precinct's page, however you reach it, also sends the City's election maps a point inside that precinct, taken from its outline and never from you, to find its districts.",
    );
    expect(item).not.toHaveTextContent("part of the request's web address");
    expect(item).not.toHaveTextContent('ordinary cache');
  });

  it('keeps saying Photon gets the typed text in its web address, and nothing is cached', () => {
    render(<PrivacyPage />);
    const item = within(section(copy.sent.heading))
      .getByRole('heading', { name: 'Address search' })
      .closest('div');

    expect(item).toHaveTextContent("Photon gets it as part of the request's web address");
    expect(item).toHaveTextContent(
      'Your browser does not keep any of these requests or their answers in its cache.',
    );
  });

  it('promises no storage, no cookies and no tracking', () => {
    render(<PrivacyPage />);
    const text = section(copy.never.heading).textContent;

    expect(text).toContain('never saves your address or your location');
    expect(text).not.toMatch(/gone when|close the page/);
    expect(text).toContain(
      "they are not put in the page address (URL), in browser storage, in cookies or in your browser's cache",
    );
    // What the browser does keep is said, not denied.
    expect(text).toContain(
      'Your browser history and cache do keep the precinct pages you open, like /p/CC007.',
    );
    expect(text).not.toContain('covered under Finding your precinct');
    expect(text).toContain('no analytics, ads or tracking');
    expect(text).toContain('sets no cookies');
  });

  it('links back home', () => {
    render(<PrivacyPage />);

    expect(screen.getByRole('link', { name: copy.backHome })).toHaveAttribute('href', '/');
  });
});
