import { createContext, useContext } from 'react';
import geocoder from '../../data/geocoder.js';

/** The geocoder the lookup uses. Tests provide a fake through this context. */
export const GeocoderContext = createContext(geocoder);

/** @returns {import('../../data/geocoder.js').Geocoder} */
export function useGeocoder() {
  return useContext(GeocoderContext);
}
