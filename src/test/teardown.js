import { cleanup } from '@testing-library/react';
import { vi } from 'vitest';

// The real setTimeout, kept before any test fakes timers, so the waits below
// still end while a test has left them faked.
const realSetTimeout = globalThis.setTimeout;
const wait = (ms) => new Promise((resolve) => realSetTimeout(resolve, ms));

// Whether any of the stub's answers is one query() retries: a failed fetch,
// a 5xx or a 429 (isTransient in src/data/arcgis.js). It cannot see an HTTP
// 200 ArcGIS error body without a code, which query() also retries, nor an
// answer still pending when the test ends.
const retried = (stub) =>
  vi.isMockFunction(stub) &&
  stub.mock.settledResults.some(
    ({ type, value }) =>
      type === 'rejected' ||
      (type === 'fulfilled' && (value?.status >= 500 || value?.status === 429)),
  );

/**
 * A test file's teardown for the globals it stubbed: call it in `afterEach`
 * in place of `vi.unstubAllGlobals()` (#203).
 *
 * Vitest runs after-hooks in reverse order, so the setup file's `cleanup()`
 * runs after a file's own `afterEach`. Unstubbing there first let a still
 * mounted page reach the setup file's failing fetch, whose retry then landed
 * on a later test's stub (#186). And a retry waits RETRY_DELAY_MS on a real
 * timer that unmounting does not stop. So this unmounts first, lets failures
 * still being handled arm their retries, waits out the delay if any did, and
 * only then restores the globals. Node fires timers of the same delay in the
 * order they were set, so each retry reaches this test's own stub.
 *
 * With setTimeout faked at teardown it does not wait: a retry armed on the
 * fake clock never fires. Faking only Date leaves setTimeout real.
 */
export async function unmountThenUnstub() {
  cleanup();
  if (globalThis.setTimeout === realSetTimeout) {
    const stub = globalThis.fetch;
    await wait(0);
    if (retried(stub)) {
      // The real module's value: some files mock src/data/arcgis.js.
      const { RETRY_DELAY_MS } = await vi.importActual('../data/arcgis.js');
      await wait(RETRY_DELAY_MS);
    }
  }
  vi.unstubAllGlobals();
}
