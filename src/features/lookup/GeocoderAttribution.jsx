import TextLink from '../../components/TextLink.jsx';
import { attribution } from '../../data/geocoder.js';
import { copy } from './lookupCopy.js';

/**
 * Credits the address search sources: St. Louis County's address points
 * first, then the fallback service and its OpenStreetMap data, as the data
 * license requires, then the City of St. Louis's address search, which finds
 * City addresses (#88) and checks that the City does not have the same
 * address (#58). It also says where the
 * typed address goes.
 */
export default function GeocoderAttribution() {
  const text = copy.attribution;
  const { county, fallback, city } = attribution;
  return (
    <p className="mt-2 text-sm text-muted">
      {text.searchBy} {county.by}{' '}
      <TextLink href={county.url} rel="noreferrer">
        {county.data}
      </TextLink>{' '}
      ({county.publisher}), {text.then}{' '}
      <TextLink href={fallback.serviceUrl} rel="noreferrer">
        {fallback.service}
      </TextLink>{' '}
      {text.by} {fallback.serviceBy}. {fallback.service} {text.data}{' '}
      <TextLink href={fallback.dataUrl} rel="noreferrer">
        {fallback.data}
      </TextLink>
      . {text.cityCheck} {city.by} {city.service}. {text.privacy}
    </p>
  );
}
