import { attribution } from '../../data/geocoder.js';
import { copy } from './lookupCopy.js';

const linkClass = 'text-primary underline';

/**
 * Credits the address search service and its OpenStreetMap data, as the data
 * license requires, and says where the typed address goes.
 */
export default function GeocoderAttribution() {
  const text = copy.attribution;
  return (
    <p className="mt-2 text-sm text-muted">
      {text.searchBy}{' '}
      <a href={attribution.serviceUrl} rel="noreferrer" className={linkClass}>
        {attribution.service}
      </a>{' '}
      {text.by} {attribution.serviceBy}. {text.data}{' '}
      <a href={attribution.dataUrl} rel="noreferrer" className={linkClass}>
        {attribution.data}
      </a>
      . {text.privacy}
    </p>
  );
}
