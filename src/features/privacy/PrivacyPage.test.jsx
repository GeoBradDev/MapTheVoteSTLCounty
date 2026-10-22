import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { render, screen, within } from '@testing-library/react';
import { parse } from 'yaml';
import election from '../../config/election.js';
import PrivacyPage from './PrivacyPage.jsx';
import { copy, hosts } from './privacyCopy.js';

const ROOT = path.resolve(import.meta.dirname, '../../..');

// The connect-src origins render.yaml allows, other than 'self': every
// third party the browser may send a request to.
async function connectOrigins() {
  const blueprint = parse(await readFile(path.join(ROOT, 'render.yaml'), 'utf8'));
  const csp = blueprint.services[0].headers.find(
    (rule) => rule.path === '/*' && rule.name === 'Content-Security-Policy',
  ).value;
  const directive = csp
    .split(';')
    .map((d) => d.trim().split(/\s+/))
    .find(([name]) => name === 'connect-src');
  return directive.slice(1).filter((source) => source !== "'self'");
}

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

  // A new third party in the policy means a new place data goes: the notice
  // must say so in the same change.
  it('names every third-party origin the Content-Security-Policy allows', async () => {
    render(<PrivacyPage />);
    const text = section(copy.sent.heading).textContent;
    // Whole host names in parentheses, so a new origin like arcgis.com is not
    // passed by a longer name such as services6.arcgis.com that contains it.
    const named = new Set([...text.matchAll(/\(([a-z0-9.-]+\.[a-z]+)\)/g)].map((m) => m[1]));
    const origins = await connectOrigins();

    expect(origins.length).toBeGreaterThan(0);
    for (const origin of origins) expect(named).toContain(new URL(origin).host);
  });

  it('names the election maps host from the election config', () => {
    expect(hosts.electionMaps).toBe(new URL(election.serviceRoot).host);
  });

  // The wait times page (#104): both boards' layers, the refresh rate and
  // nothing about the voter, all from the config.
  it('says what the wait times page asks, from the config', () => {
    render(<PrivacyPage />);
    const { county, city, refreshSeconds } = election.waitTimes;
    const item = screen.getByRole('heading', { name: 'Early voting wait times' }).parentElement;
    for (const text of [
      county.source,
      city.source,
      new URL(county.serviceRoot).host,
      new URL(city.serviceRoot).host,
      `every ${refreshSeconds} seconds`,
      'carry nothing about you',
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
      'It also goes to Photon by komoot (photon.komoot.io) when the county has no match or cannot be reached;',
    );
    expect(item).toHaveTextContent(
      "its house number and street (not the town, ZIP code or unit) also go to the City of St. Louis's address search (maps6.stlouis-mo.gov), in the body of the request, to check that the City does not have the same address. It is skipped when you typed a ZIP code that is entirely outside the City, or when the address was found in another county.",
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
      'Your browser does not keep these requests or their answers in its cache.',
    );
    expect(item).toHaveTextContent(
      'the points of all of them go there first, the same way, to check that they are in one precinct',
    );
    expect(item).toHaveTextContent('Opening a shared link sends only the precinct code.');
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
