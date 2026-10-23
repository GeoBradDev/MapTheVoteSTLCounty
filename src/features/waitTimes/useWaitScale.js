// The line count classes module (jenks.js, #172) for the polling places card,
// loaded only while it shows Election Day counts, so the results screen's
// first load never carries it.
import { useEffect, useState } from 'react';

let scaleModule = null;

/** One import, shared by every caller; a failed import is tried again later. */
export function loadWaitScale() {
  scaleModule ??= import('./jenks.js').catch((error) => {
    scaleModule = null;
    throw error;
  });
  return scaleModule;
}

/**
 * The jenks.js module once loaded while `on`, else null. Until it loads (or
 * if it fails), the map draws its markers without colors and no legend.
 * @param {boolean} on
 * @returns {typeof import('./jenks.js') | null}
 */
export function useWaitScale(on) {
  const [scale, setScale] = useState(null);
  useEffect(() => {
    if (!on || scale) return undefined;
    let current = true;
    loadWaitScale()
      .then((module) => {
        if (current) setScale(module);
      })
      .catch(() => {});
    return () => {
      current = false;
    };
  }, [on, scale]);
  return on ? scale : null;
}
