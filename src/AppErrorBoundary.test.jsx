// The app's error screen gets the precinct's jurisdiction from the path (#89,
// #93): a throwing precinct page links its own board's lookup, any other page
// both boards' lookups.
import { render, screen } from '@testing-library/react';
import { Router } from 'wouter';
import { memoryLocation } from 'wouter/memory-location';
import App from './App.jsx';
import { copy } from './components/errorBoundaryCopy.js';
import { copy as lookupsCopy } from './components/officialLookupsCopy.js';
import election from './config/election.js';
import referrals from './config/referrals.js';
import { unmountThenUnstub } from './test/teardown.js';

vi.mock('./features/lookup/PrecinctPage.jsx', () => ({
  default: () => {
    throw new Error('broken');
  },
}));
vi.mock('./features/privacy/PrivacyPage.jsx', () => ({
  default: () => {
    throw new Error('broken');
  },
}));

let errors;
beforeEach(() => {
  errors = vi.spyOn(console, 'error').mockImplementation(() => {});
  vi.stubGlobal(
    'fetch',
    vi.fn(() => new Promise(() => {})),
  );
  vi.stubGlobal('scrollTo', vi.fn());
});
afterEach(async () => {
  errors.mockRestore();
  await unmountThenUnstub();
});

function renderAt(path) {
  const { hook } = memoryLocation({ path });
  render(
    <Router hook={hook}>
      <App />
    </Router>,
  );
}

const alert = () => screen.getAllByRole('alert').find((a) => a.textContent.includes(copy.body));
const lookupLinks = () => [...alert().querySelectorAll('a')].map((a) => a.getAttribute('href'));

describe('App error screen (#93)', () => {
  it("links only the County's lookup on a County precinct page", () => {
    renderAt('/p/CC007');
    expect(lookupLinks()).toEqual([election.officialLookupUrl]);
  });

  it("links only the City's lookup on a City precinct page", () => {
    renderAt('/p/W01P12');
    expect(lookupLinks()).toEqual([referrals.stlCityLookup.url]);
  });

  it('keeps the site header on the error screen (#79)', () => {
    renderAt('/p/CC007');
    expect(alert()).toBeInTheDocument();
    expect(screen.getByRole('banner')).toBeInTheDocument();
    expect(screen.getByRole('navigation', { name: 'Site' })).toBeInTheDocument();
  });

  it("links both boards' lookups on any other page", () => {
    renderAt('/privacy');
    expect(screen.getByRole('link', { name: lookupsCopy.county })).toBeInTheDocument();
    expect(lookupLinks()).toEqual([election.officialLookupUrl, referrals.stlCityLookup.url]);
  });
});
