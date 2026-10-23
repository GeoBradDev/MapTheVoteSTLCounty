import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';

afterEach(() => {
  cleanup();
});

// No component test reaches the network. A page that loads data on its own
// (the home page's dot map, #184) gets a failed request, as offline; a test
// that needs answers stubs fetch itself (vi.stubGlobal). Node environment
// tests (the smoke test's local servers) keep the real fetch.
if (typeof window !== 'undefined') {
  globalThis.fetch = () => Promise.reject(new TypeError('No network in unit tests'));
}
