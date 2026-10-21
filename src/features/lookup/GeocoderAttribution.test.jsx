import { render, screen } from '@testing-library/react';
import { attribution } from '../../data/geocoder.js';
import GeocoderAttribution from './GeocoderAttribution.jsx';

describe('GeocoderAttribution', () => {
  it('credits OpenStreetMap contributors with a link to the copyright page', () => {
    render(<GeocoderAttribution />);
    const link = screen.getByRole('link', { name: 'OpenStreetMap contributors' });
    expect(link).toHaveAttribute('href', 'https://www.openstreetmap.org/copyright');
    expect(link.closest('p')).toHaveTextContent('© OpenStreetMap contributors');
  });

  it('names the address search service and who runs it', () => {
    render(<GeocoderAttribution />);
    const link = screen.getByRole('link', { name: attribution.service });
    expect(link).toHaveAttribute('href', attribution.serviceUrl);
    expect(link.closest('p')).toHaveTextContent(`by ${attribution.serviceBy}`);
  });

  it('says the address is not saved', () => {
    render(<GeocoderAttribution />);
    expect(screen.getByText(/is not saved/)).toBeInTheDocument();
  });
});
