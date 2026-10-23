import { useState } from 'react';

// Wide enough for the results to show every section open (Tailwind's `sm`).
const WIDE = '(min-width: 640px)';

/**
 * Whether the screen is wide, read once when the component mounts. Without
 * matchMedia (an old browser, or a test), it counts as wide, so nothing is
 * folded away where the width is unknown.
 */
export function useWideOnMount() {
  const [wide] = useState(() => globalThis.matchMedia?.(WIDE).matches ?? true);
  return wide;
}
