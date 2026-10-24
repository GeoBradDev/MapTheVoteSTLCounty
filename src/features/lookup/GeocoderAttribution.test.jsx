import { render, screen } from '@testing-library/react';
import { attribution } from '../../data/geocoder.js';
import GeocoderAttribution from './GeocoderAttribution.jsx';

describe('GeocoderAttribution', () => {
  // #216: folded under one line, one tap away, and opened for printing by
  // Disclosure; the credits stay in the page next to the search.
  it('folds the credits into a closed "Address search sources" disclosure', () => {
    render(<GeocoderAttribution />);
    const summary = screen.getByText('Address search sources');
    const details = summary.closest('details');
    expect(details).not.toBeNull();
    expect(details).not.toHaveAttribute('open');
    expect(details).toContainElement(screen.getByText(/sent only to these services/));
    expect(details).toContainElement(
      screen.getByRole('link', { name: 'OpenStreetMap contributors' }),
    );
  });

  it('links the privacy notice from the credits', () => {
    render(<GeocoderAttribution />);
    const link = screen.getByRole('link', { name: 'privacy notice' });
    expect(link).toHaveAttribute('href', '/privacy');
    expect(link.closest('details')).not.toBeNull();
  });

  it('credits St. Louis County for the address points, with a link to the data', () => {
    render(<GeocoderAttribution />);
    const link = screen.getByRole('link', { name: attribution.county.data });
    expect(link).toHaveAttribute('href', attribution.county.url);
    expect(link.closest('p')).toHaveTextContent(
      'Address search: St. Louis County address points (GIS Service Center), or, when needed,',
    );
  });

  it('credits OpenStreetMap contributors with a link to the copyright page', () => {
    render(<GeocoderAttribution />);
    const link = screen.getByRole('link', { name: 'OpenStreetMap contributors' });
    expect(link).toHaveAttribute('href', 'https://www.openstreetmap.org/copyright');
    expect(link.closest('p')).toHaveTextContent('© OpenStreetMap contributors');
  });

  it('names the fallback address search service and who runs it', () => {
    render(<GeocoderAttribution />);
    const link = screen.getByRole('link', { name: attribution.fallback.service });
    expect(link).toHaveAttribute('href', attribution.fallback.serviceUrl);
    expect(link.closest('p')).toHaveTextContent(
      `or, when needed, ${attribution.fallback.service} by ${attribution.fallback.serviceBy}.`,
    );
  });

  it('names the City of St. Louis address search, a source and a check (#58, #88)', () => {
    render(<GeocoderAttribution />);
    expect(screen.getByText(/sent only to these services/)).toHaveTextContent(
      'St. Louis City addresses are found, and an address found outside the City may be checked, with the City of St. Louis address search. Your address is sent only to these services',
    );
  });

  it('says where the address goes and that this site does not save it', () => {
    render(<GeocoderAttribution />);
    expect(screen.getByText(/sent only to these services/)).toHaveTextContent(
      'This site does not save it.',
    );
  });
});
