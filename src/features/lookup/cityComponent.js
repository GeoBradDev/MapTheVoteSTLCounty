import { createElement, lazy, useState } from 'react';
import { loadCityClient, loadedCityClient } from '../../data/jurisdictions.js';

/**
 * A City-only component from the City chunk (src/cityChunk.js), for a City
 * precinct's cards. Render it inside a Suspense boundary. The chunk is the one
 * the City data already loaded, so no new request is made (#147). Once the
 * chunk is here, the component renders at once without suspending, so nothing
 * appears late and pushes the page down (#81); each use picks one way when it
 * mounts and keeps it, so it never remounts and loses its state.
 * @param {string} name The chunk's export, like `CityEarlyVotingCard`.
 */
export function cityComponent(name) {
  const Lazy = lazy(() => loadCityClient().then((chunk) => ({ default: chunk[name] })));
  function CityComponent(props) {
    const [Component] = useState(() => loadedCityClient()?.[name] ?? Lazy);
    return createElement(Component, props);
  }
  CityComponent.displayName = `City(${name})`;
  return CityComponent;
}
