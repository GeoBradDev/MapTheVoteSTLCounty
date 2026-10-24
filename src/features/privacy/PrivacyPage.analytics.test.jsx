// The privacy notice once Google Analytics' measurement ID is set (#69). The
// ID ships empty (owner decision on #69), so the notice follows the config:
// this file sets one, as the owner will, and checks the notice then says
// exactly what goes to Google, and that it names every origin the
// Content-Security-Policy allows.
import { render, screen } from '@testing-library/react';
import { ANALYTICS_HOSTS, analyticsEnabled } from '../../analytics/index.js';
import { connectOrigins, namedHosts } from '../../test/privacyNotice.js';
import PrivacyPage from './PrivacyPage.jsx';
import { copy } from './privacyCopy.js';

vi.mock('../../config/site.js', async (importOriginal) => ({
  ...(await importOriginal()),
  gaMeasurementId: 'G-TEST123',
}));

const section = (name) => screen.getByRole('region', { name });
const item = (heading) => screen.getByRole('heading', { name: heading }).parentElement;

describe('PrivacyPage with Google Analytics on', () => {
  it('is rendered with the measurement ID set', () => {
    expect(analyticsEnabled()).toBe(true);
  });

  it('names every third-party origin the Content-Security-Policy allows', async () => {
    render(<PrivacyPage />);
    const named = namedHosts(section(copy.sent.heading).textContent);
    const origins = await connectOrigins();

    expect(origins.length).toBeGreaterThan(0);
    for (const origin of origins) expect(named).toContain(new URL(origin).host);
    for (const host of Object.values(ANALYTICS_HOSTS)) expect(named).toContain(host);
  });

  it('no longer says the site has no analytics, and still sets no cookies', () => {
    render(<PrivacyPage />);
    expect(document.body).not.toHaveTextContent('no analytics');
    expect(screen.getByText(copy.intro)).not.toHaveTextContent(/analytics/i);
    expect(section(copy.never.heading)).toHaveTextContent('sets no cookies');
    expect(section(copy.never.heading)).toHaveTextContent('shows no ads');
  });

  it('says what Google Analytics gets, and what it never gets', () => {
    render(<PrivacyPage />);
    const ga = item('Visit counts');
    for (const text of [
      'Google Analytics',
      `(${ANALYTICS_HOSTS.loader})`,
      `(${ANALYTICS_HOSTS.collector})`,
      'which kind of page you open',
      'a How to vote topic (and which topic)',
      "never gets your address, your device's location or your precinct",
      "every precinct's results are counted as one page",
      'your IP address and your browser',
      'a rough location from your IP address',
      'set no cookies',
      'Global Privacy Control',
    ]) {
      expect(ga).toHaveTextContent(text);
    }
  });

  // #70: the voter actions it counts, and what they never carry.
  it('says which presses it counts and that a search is counted without what or where', () => {
    render(<PrivacyPage />);
    const ga = item('Visit counts');
    for (const text of [
      'which buttons and links you press',
      'sample ballot',
      'directions',
      'Share',
      'official lookup',
      'Try again',
      'how a search ended',
      'whether it used an address or your location',
      'whether it found a precinct or why not',
      'outside St. Louis City and County',
      'in St. Louis City or St. Louis County but no precinct was found for it',
      'never what you searched for, your address or location, or which place, precinct or web address it was',
    ]) {
      expect(ga).toHaveTextContent(text);
    }
    expect(section(copy.never.heading)).toHaveTextContent(
      "never include your address, your device's location, your precinct or what you searched for",
    );
  });
});
