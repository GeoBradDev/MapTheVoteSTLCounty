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
    const origins = await connectOrigins();

    expect(origins.length).toBeGreaterThan(0);
    for (const origin of origins) expect(text).toContain(new URL(origin).host);
  });

  it('names the election maps host from the election config', () => {
    expect(hosts.electionMaps).toBe(new URL(election.serviceRoot).host);
  });

  it('says where the typed address goes: the county service and Photon', () => {
    render(<PrivacyPage />);
    const item = within(section(copy.sent.heading))
      .getByRole('heading', { name: 'Address search' })
      .closest('div');

    expect(item).toHaveTextContent(
      "St. Louis County's address service and to Photon by komoot (photon.komoot.io), which this site uses to find addresses and to check them",
    );
  });

  // Issue #38 is open: point queries still carry coordinates in a GET query
  // string. The notice must not claim otherwise until that changes.
  it('says plainly that coordinates go in the request address and may be cached', () => {
    render(<PrivacyPage />);
    const item = within(section(copy.sent.heading))
      .getByRole('heading', { name: 'Finding your precinct' })
      .closest('div');

    expect(item).toHaveTextContent("The coordinates are part of the request's web address");
    expect(item).toHaveTextContent('may record them in its logs');
    expect(item).toHaveTextContent('your browser may keep the answer in its ordinary cache');
  });

  it('promises no storage, no cookies and no tracking', () => {
    render(<PrivacyPage />);
    const text = section(copy.never.heading).textContent;

    expect(text).toContain('never saves your address or your location');
    // The HTTP cache (#38) is described, not denied.
    expect(text).not.toMatch(/gone when|close the page/);
    expect(text).toContain("Your browser's own cache is covered under Finding your precinct");
    expect(text).toContain('browser storage');
    expect(text).toContain('no analytics, ads or tracking');
    expect(text).toContain('sets no cookies');
  });

  it('links back home', () => {
    render(<PrivacyPage />);

    expect(screen.getByRole('link', { name: copy.backHome })).toHaveAttribute('href', '/');
  });
});
