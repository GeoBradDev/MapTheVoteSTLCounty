import { render, screen } from '@testing-library/react';
import { attribution } from '../../data/geocoder.js';
import GeocoderAttribution from './GeocoderAttribution.jsx';

describe('GeocoderAttribution', () => {
  it('credits St. Louis County for the address points, with a link to the data', () => {
    render(<GeocoderAttribution />);
    const link = screen.getByRole('link', { name: attribution.county.data });
    expect(link).toHaveAttribute('href', attribution.county.url);
    expect(link.closest('p')).toHaveTextContent('Address search: St. Louis County address points');
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

  it('says where the address goes and that this site does not save it', () => {
    render(<GeocoderAttribution />);
    expect(screen.getByText(/sent only to these services/)).toHaveTextContent(
      'This site does not save it.',
    );
  });
});
