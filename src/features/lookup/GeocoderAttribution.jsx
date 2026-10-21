import { attribution } from '../../data/geocoder.js';
import { copy } from './lookupCopy.js';

const linkClass = 'text-primary underline';

/**
 * Credits the address search sources: St. Louis County's address points
 * first, then the fallback service and its OpenStreetMap data, as the data
 * license requires, then the City of St. Louis's address search, which checks
 * that the City does not have the same address (#58). It also says where the
 * typed address goes.
 */
export default function GeocoderAttribution() {
  const text = copy.attribution;
  const { county, fallback, city } = attribution;
  return (
    <p className="mt-2 text-sm text-muted">
      {text.searchBy} {county.by}{' '}
      <a href={county.url} rel="noreferrer" className={linkClass}>
        {county.data}
      </a>{' '}
      ({county.publisher}), {text.then}{' '}
      <a href={fallback.serviceUrl} rel="noreferrer" className={linkClass}>
        {fallback.service}
      </a>{' '}
      {text.by} {fallback.serviceBy}. {fallback.service} {text.data}{' '}
      <a href={fallback.dataUrl} rel="noreferrer" className={linkClass}>
        {fallback.data}
      </a>
      . {text.cityCheck} {city.by} {city.service}. {text.privacy}
    </p>
  );
}
