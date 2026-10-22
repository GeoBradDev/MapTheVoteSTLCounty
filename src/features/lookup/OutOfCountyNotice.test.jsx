import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { render, screen } from '@testing-library/react';
import election from '../../config/election.js';
import referrals from '../../config/referrals.js';
import OutOfCountyNotice from './OutOfCountyNotice.jsx';
import { copy } from './outOfCountyCopy.js';

const SRC = path.resolve(import.meta.dirname, '../..');

function links() {
  return screen.queryAllByRole('link').map((link) => link.getAttribute('href'));
}

describe('OutOfCountyNotice', () => {
  it('sends a St. Louis City voter whose precinct was not found to the City board and its lookup', () => {
    render(<OutOfCountyNotice kind="stl-city" />);
    expect(screen.getByRole('heading', { level: 2 })).toHaveTextContent(
      'This address is in the City of St. Louis',
    );
    expect(screen.getByText(/could not find its City precinct/)).toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: 'St. Louis City Board of Election Commissioners' }),
    ).toHaveAttribute('href', referrals.stlCityBoard.url);
    expect(screen.getByRole('link', { name: "City's polling place lookup" })).toHaveAttribute(
      'href',
      referrals.stlCityLookup.url,
    );
    expect(links()).toEqual([referrals.stlCityBoard.url, referrals.stlCityLookup.url]);
  });

  it('sends a voter elsewhere in Missouri to the Voter Outreach Center', () => {
    render(<OutOfCountyNotice kind="missouri" />);
    expect(screen.getByRole('heading', { level: 2 })).toHaveTextContent(
      'This address is outside St. Louis City and County',
    );
    expect(
      screen.getByText(/covers St\. Louis City and St\. Louis County only/),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: 'Missouri Secretary of State Voter Outreach Center' }),
    ).toHaveAttribute('href', referrals.moVoterOutreach.url);
    expect(links()).toEqual([referrals.moVoterOutreach.url]);
  });

  it('gives an out-of-state voter a short generic message with no links', () => {
    render(<OutOfCountyNotice kind="out-of-state" />);
    expect(screen.getByRole('heading', { level: 2 })).toHaveTextContent(
      'This address is outside Missouri',
    );
    expect(
      screen.getByText(/St\. Louis City and St\. Louis County, Missouri only/),
    ).toBeInTheDocument();
    expect(screen.getByText(/local election office/)).toBeInTheDocument();
    expect(links()).toEqual([]);
  });

  it('covers both Missouri and elsewhere when the state is not known', () => {
    render(<OutOfCountyNotice kind="unknown" />);
    expect(screen.getByRole('heading', { level: 2 })).toHaveTextContent(
      'This location is outside St. Louis City and County',
    );
    // A City voter is no longer sent to the Secretary of State (#88).
    expect(screen.queryByText(/including the City of St\. Louis/)).toBeNull();
    expect(screen.getByText(/anywhere else in Missouri/)).toBeInTheDocument();
    expect(screen.getByText(/local election office/)).toBeInTheDocument();
    expect(links()).toEqual([referrals.moVoterOutreach.url]);
  });

  it('sends a point in the county with no precinct to the official county lookup', () => {
    render(<OutOfCountyNotice kind="county-unmatched" />);
    expect(screen.getByRole('heading', { level: 2 })).toHaveTextContent(
      'We could not find a precinct for this location',
    );
    expect(links()).toEqual([election.officialLookupUrl]);
  });

  it.each(['stl-city', 'missouri', 'unknown', 'county-unmatched'])(
    'keeps the referrer from the official site for %s',
    (kind) => {
      render(<OutOfCountyNotice kind={kind} />);
      for (const link of screen.getAllByRole('link')) {
        expect(link).toHaveAttribute('rel', 'noreferrer');
      }
    },
  );

  it.each(['precinct', 'nonsense', undefined])('renders nothing for %s', (kind) => {
    const { container } = render(<OutOfCountyNotice kind={kind} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('uses the heading level it is given, for a notice inside a titled section', () => {
    render(<OutOfCountyNotice kind="stl-city" headingLevel={3} />);
    expect(screen.getByRole('heading', { level: 3 })).toHaveTextContent(
      'This address is in the City of St. Louis',
    );
    expect(screen.queryByRole('heading', { level: 2 })).toBeNull();
  });

  it('has copy for every kind it renders, and names no party or candidate', () => {
    expect(Object.keys(copy).sort()).toEqual(
      ['county-unmatched', 'missouri', 'out-of-state', 'stl-city', 'unknown'].sort(),
    );
    const text = JSON.stringify(copy);
    expect(text).not.toMatch(/democrat|republican|libertarian|green party|candidate/i);
  });
});

describe('referral links', () => {
  it('go to official government sites over https', () => {
    expect(new URL(referrals.stlCityBoard.url).hostname).toBe('www.stlouis-mo.gov');
    expect(new URL(referrals.moVoterOutreach.url).hostname).toBe('voteroutreach.sos.mo.gov');
    for (const { url } of Object.values(referrals)) expect(url).toMatch(/^https:\/\//);
  });

  it('are written only in src/config/referrals.js', async () => {
    const entries = await readdir(SRC, { withFileTypes: true, recursive: true });
    const files = entries
      .filter((e) => e.isFile())
      .map((e) => path.join(e.parentPath, e.name))
      .filter((file) => file !== path.join(SRC, 'config/referrals.js'));
    const found = [];
    for (const file of files) {
      const text = await readFile(file, 'utf8');
      for (const { url } of Object.values(referrals)) {
        if (text.includes(url)) found.push(`${path.relative(SRC, file)}: ${url}`);
      }
    }
    expect(found).toEqual([]);
  });
});
