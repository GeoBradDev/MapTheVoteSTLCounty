import { afterEach, describe, expect, it, vi } from 'vitest';
import { query, RETRY_DELAY_MS } from '../data/arcgis.js';
import { unmountThenUnstub } from './teardown.js';

// #203: a request sent to the setup file's fetch, which fails as offline, is
// retried RETRY_DELAY_MS later like any other. The two tests run in this
// order, so the second sees what the first left behind.
afterEach(unmountThenUnstub);

describe("a retry of the setup file's fetch still waiting when the test ends", () => {
  it('starts a request with no fetch stubbed and ends before its retry', async () => {
    query('polls', { where: '1=1', outFields: 'loc', f: 'json' }).catch(() => {});
    await new Promise((resolve) => setTimeout(resolve, 0));
  });

  it('gets no request from the test before', async () => {
    const fetchMock = vi.fn(() => new Promise(() => {}));
    vi.stubGlobal('fetch', fetchMock);
    await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY_MS + 100));
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
