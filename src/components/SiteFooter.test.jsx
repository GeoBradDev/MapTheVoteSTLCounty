import { render, screen, within } from '@testing-library/react';
import { Router } from 'wouter';
import { memoryLocation } from 'wouter/memory-location';
import App from '../App.jsx';
import election from '../config/election.js';
import referrals from '../config/referrals.js';
import { copy as privacyCopy } from '../features/privacy/privacyCopy.js';
import { copy } from './siteFooterCopy.js';
import SiteFooter from './SiteFooter.jsx';

// The home page throws, so the app shows the error boundary's page.
vi.mock('../features/lookup/HomePage.jsx', () => ({
  default: () => {
    throw new Error('boom');
  },
}));

function renderFooter() {
  const { hook } = memoryLocation({ path: '/' });
  return render(
    <Router hook={hook}>
      <SiteFooter />
    </Router>,
  );
}

describe('SiteFooter', () => {
  it('says the site is nonpartisan, unofficial and not run by either board', () => {
    expect(copy.statement).toMatch(/nonpartisan/i);
    expect(copy.statement).toMatch(/unofficial/i);
    expect(copy.statement).toContain('St. Louis County Board of Elections');
    expect(copy.statement).toContain('St. Louis City Board of Election Commissioners');
    expect(copy.statement).toMatch(/not affiliated/i);
  });

  it('links each board from the config, with a 44px target', () => {
    renderFooter();
    const county = screen.getByRole('link', { name: copy.countySite });
    const city = screen.getByRole('link', { name: copy.citySite });
    expect(county).toHaveAttribute('href', election.countySiteUrl);
    expect(city).toHaveAttribute('href', referrals.stlCityBoard.url);
    for (const link of [county, city, screen.getByRole('link', { name: 'Privacy' })]) {
      expect(link).toHaveClass('min-h-11');
    }
  });

  it('prints the statement and the board links, but not the Privacy link', () => {
    renderFooter();
    const footer = screen.getByRole('contentinfo');
    expect(footer).not.toHaveClass('print:hidden');
    const statement = screen.getByText(copy.statement);
    expect(statement.closest('.print\\:hidden')).toBeNull();
    expect(
      screen.getByRole('link', { name: copy.countySite }).closest('.print\\:hidden'),
    ).toBeNull();
    expect(screen.getByRole('link', { name: copy.citySite }).closest('.print\\:hidden')).toBeNull();
    expect(screen.getByRole('link', { name: 'Privacy' }).closest('.print\\:hidden')).not.toBeNull();
  });

  it('names no party or candidate', () => {
    const text = JSON.stringify(copy).toLowerCase();
    for (const word of ['democrat', 'republican', 'libertarian', 'green party', 'candidate']) {
      expect(text).not.toContain(word);
    }
  });

  it("agrees with the privacy notice's opening", () => {
    expect(privacyCopy.intro).toMatch(/nonpartisan/i);
    expect(privacyCopy.intro).toContain('St. Louis County Board of Elections');
    expect(privacyCopy.intro).toContain('St. Louis City Board of Election Commissioners');
  });

  it("shows the statement on the error boundary's page too", () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const { hook } = memoryLocation({ path: '/' });
    render(
      <Router hook={hook}>
        <App />
      </Router>,
    );
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Something went wrong');
    const footer = screen.getByRole('contentinfo');
    expect(footer).toHaveTextContent(copy.statement);
    expect(within(footer).getByRole('link', { name: copy.countySite })).toHaveAttribute(
      'href',
      election.countySiteUrl,
    );
    vi.restoreAllMocks();
  });
});
