import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';

// After-hooks run in reverse order, so this runs after a test file's own. A
// file that stubs globals unmounts in its afterEach instead, through
// unmountThenUnstub in ./teardown.js, before it restores them (#203).
afterEach(() => {
  cleanup();
});

// No component test reaches the network: a request no test stubbed (a wait
// time loop a page starts on its own, #184) gets a failed request, as
// offline; a test that needs answers stubs fetch itself (vi.stubGlobal). Node environment
// tests (the smoke test's local servers) keep the real fetch.
if (typeof window !== 'undefined') {
  globalThis.fetch = () => Promise.reject(new TypeError('No network in unit tests'));
}
