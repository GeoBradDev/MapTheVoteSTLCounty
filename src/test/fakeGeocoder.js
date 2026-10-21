// A Geocoder (src/data/geocoder.js) for tests and local harnesses: it answers
// from a fixed list of places and records what it was asked.

function abortError() {
  return new DOMException('The operation was aborted.', 'AbortError');
}

/**
 * @param {Array<{ label: string, lat: number, lng: number, state?: string, county?: string }>} places
 * @param {{ delayMs?: number }} [options] How long each answer takes.
 */
export function createFakeGeocoder(places, { delayMs = 0 } = {}) {
  const calls = { suggest: [], geocode: [] };

  function answer(value, signal) {
    return new Promise((resolve, reject) => {
      if (signal?.aborted) return reject(abortError());
      const timer = setTimeout(() => resolve(value()), delayMs);
      signal?.addEventListener('abort', () => {
        clearTimeout(timer);
        reject(abortError());
      });
    });
  }

  const matches = (text) =>
    places.filter((p) => p.label.toLowerCase().includes(text.trim().toLowerCase()));

  return {
    calls,
    suggest(text, { signal } = {}) {
      calls.suggest.push(text);
      return answer(
        () => matches(text).map(({ label }, i) => ({ id: `fake-${i}-${label}`, label })),
        signal,
      );
    },
    geocode(query, { signal } = {}) {
      calls.geocode.push(query);
      const text = typeof query === 'string' ? query : query.label;
      return answer(() => {
        const [place] = matches(text);
        return place ? { ...place } : null;
      }, signal);
    },
  };
}
