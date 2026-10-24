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
    const ga = item('Page counts');
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
});
