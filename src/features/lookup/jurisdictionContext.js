// The jurisdiction of the precinct a results page shows (#86). The page
// provides it; the cards read their data through it. The default is the
// County, so a card rendered on its own works as it always has.
import { createContext, useContext } from 'react';
import { county } from '../../data/jurisdictions.js';

export const JurisdictionContext = createContext(county);

/** @returns {import('../../data/jurisdictions.js').Jurisdiction} */
export function useJurisdiction() {
  return useContext(JurisdictionContext);
}
