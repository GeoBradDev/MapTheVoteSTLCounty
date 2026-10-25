import { render } from '@testing-library/react';
import { useEffect } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { query, RETRY_DELAY_MS } from '../data/arcgis.js';
import { unmountThenUnstub } from './teardown.js';

// #203: what one test starts must never reach a later test's stubs. The tests
// in each describe run in this order (the file's tests run in order, no
// shuffle), so the second test of each pair sees what the first left behind.
afterEach(unmountThenUnstub);

describe('a retry still waiting when the test ends', () => {
  it('starts a request that fails and ends before its retry', async () => {
    const failing = vi.fn(() => Promise.reject(new TypeError('offline')));
    vi.stubGlobal('fetch', failing);
    query('polls', { where: '1=1', outFields: 'loc', f: 'json' }).catch(() => {});
    await vi.waitFor(() => expect(failing).toHaveBeenCalledTimes(1));
  });

  it('gets no request from the test before', async () => {
    const fetchMock = vi.fn(() => new Promise(() => {}));
    vi.stubGlobal('fetch', fetchMock);
    await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY_MS + 100));
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('a page still mounted when the test ends', () => {
  // The fetch the page reaches as it unmounts, and the test's own stub.
  let reached;
  let stub;

  function Page() {
    useEffect(() => () => (reached = globalThis.fetch), []);
    return null;
  }

  it('is left mounted by its test', () => {
    stub = vi.fn();
    vi.stubGlobal('fetch', stub);
    render(<Page />);
  });

  it('was unmounted while its test stubs were still in place', () => {
    expect(reached).toBe(stub);
  });
});

describe('a test that ends with fake timers', () => {
  it('leaves setTimeout faked', () => {
    vi.useFakeTimers();
    vi.stubGlobal('fetch', vi.fn());
    render(<p>still here</p>);
  });

  it('did not hang the teardown', () => {
    vi.useRealTimers();
    expect(document.body).toBeEmptyDOMElement();
  });
});
