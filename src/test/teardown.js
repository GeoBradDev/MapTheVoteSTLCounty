import { cleanup } from '@testing-library/react';
import { vi } from 'vitest';

// The real setTimeout, kept before any test fakes timers, so the waits below
// still end while a test has left them faked.
const realSetTimeout = globalThis.setTimeout;
const wait = (ms) => new Promise((resolve) => realSetTimeout(resolve, ms));

/**
 * The fetch src/test/setup.js gives every component test: no test reaches the
 * network, so a request no test stubbed (a wait time loop a page starts on its
 * own, #184) fails, as offline. A mock, so the teardown below can see whether
 * one of its failures still waits for a retry; the setup file clears its calls
 * before each test.
 */
export const offlineFetch = vi.fn(() => Promise.reject(new TypeError('No network in unit tests')));

// An answer query() retries: a failed fetch, a 5xx or a 429 (isTransient in
// src/data/arcgis.js). It cannot see the HTTP 200 answers query() also
// retries, since the page has already read their body: an ArcGIS error body
// whose code is missing, 5xx or 429, or a body that fails to download.
const transient = ({ type, value }) =>
  type === 'rejected' || (type === 'fulfilled' && (value?.status >= 500 || value?.status === 429));

// Whether a retry may still be waiting: a transient answer with no later
// request to the same URL and body, which would be its retry. A retry that
// already ran needs no wait; most tests of a failure await both attempts.
// Two identical requests failing at once read as one request and its retry,
// as a page in StrictMode sends them; no test here gives such a pair a
// transient answer today.
function retryPending(stub) {
  if (!vi.isMockFunction(stub)) return false;
  const waiting = new Map();
  stub.mock.calls.forEach(([input, init], i) => {
    const key = `${input?.url ?? input} ${init?.body ?? ''}`;
    if (waiting.get(key)) waiting.set(key, false);
    else waiting.set(key, transient(stub.mock.settledResults[i]));
  });
  return [...waiting.values()].some(Boolean);
}

/**
 * A test file's teardown for the globals it stubbed: call it in `afterEach`
 * in place of `vi.unstubAllGlobals()` (#203).
 *
 * Vitest runs after-hooks in reverse order, so the setup file's `cleanup()`
 * runs after a file's own `afterEach`. Unstubbing there first let a still
 * mounted page reach the setup file's failing fetch, whose retry then landed
 * on a later test's stub (#186). And a retry waits RETRY_DELAY_MS on a real
 * timer that unmounting does not stop. So this unmounts first, lets failures
 * still being handled arm their retries, waits out the delay if one may still
 * be waiting, and only then restores the globals. Node fires timers of the same delay in the
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
    if (retryPending(stub) || retryPending(offlineFetch)) {
      // The real module's value: some files mock src/data/arcgis.js.
      const { RETRY_DELAY_MS } = await vi.importActual('../data/arcgis.js');
      await wait(RETRY_DELAY_MS);
    }
  }
  vi.unstubAllGlobals();
}
