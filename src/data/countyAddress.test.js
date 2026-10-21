import {
  attribution,
  createCountyAddressSource,
  findWhere,
  HOSTED_URL,
  LIVE_URL,
  suggestWhere,
} from './countyAddress.js';
import { GeocoderUnavailableError } from './geocoderError.js';

// One address point as the county layers return it (f=json, outSR=4326).
function point(attributes, [x, y] = [-90.4581, 38.6822]) {
  return {
    attributes: {
      OBJECTID: 1,
      ADRNO: 1318,
      ADRDIR: '',
      ADRSTR: 'ROSS',
      ADRSUF: 'AVE',
      UNITDESC: '',
      UNITNO: '',
      MAILINGCITY: 'SAINT LOUIS',
      ZIPCODE: '63146',
      FULL_ADDRESS: '1318 ROSS AVE',
      STATUS: 'Current',
      ...attributes,
    },
    geometry: { x, y },
  };
}

const ROSS = point({});
// The server filter is loose ("%ROSS%"), so the answer holds near misses too.
const CROSSING = point(
  {
    OBJECTID: 2,
    ADRSTR: 'BIG BEND CROSSING',
    ADRSUF: 'DR',
    ZIPCODE: '63088',
    MAILINGCITY: 'VALLEY PARK',
    FULL_ADDRESS: '1318 BIG BEND CROSSING DR',
  },
  [-90.4815, 38.5663],
);

function respond(body, { status = 200 } = {}) {
  return { ok: status >= 200 && status < 300, status, json: async () => body };
}

// A fetch that answers with `answer(params)` and records each call, honoring
// the request's signal like the real fetch does.
function fakeFetch(answer) {
  const calls = [];
  const fn = vi.fn((url, init) => {
    const params = new URLSearchParams(init?.body);
    calls.push({ url, init, params });
    return new Promise((resolve, reject) => {
      const abort = () => reject(new DOMException('The operation was aborted.', 'AbortError'));
      if (init?.signal?.aborted) return abort();
      init?.signal?.addEventListener('abort', abort);
      Promise.resolve()
        .then(() => answer(params))
        .then(resolve, reject);
    });
  });
  fn.calls = calls;
  return fn;
}

const answering = (...features) => fakeFetch(() => respond({ features }));
const source = (fetch, options) => createCountyAddressSource({ url: LIVE_URL, fetch, ...options });

describe('the county layers', () => {
  it('are the live county server first and the hosted copy second', () => {
    expect(LIVE_URL).toBe(
      'https://maps.stlouisco.com/hosting/rest/services/Maps/ASR_Address_Points/FeatureServer/0',
    );
    expect(HOSTED_URL).toBe(
      'https://services2.arcgis.com/w657bnjzrjguNyOy/arcgis/rest/services/Address_Points/FeatureServer/2',
    );
  });

  it('credit St. Louis County with a link to the data', () => {
    expect(attribution.by).toBe('St. Louis County');
    expect(attribution.url).toMatch(/^https:\/\//);
  });
});

describe('findWhere', () => {
  it('asks for the house number, current addresses and one street word', () => {
    expect(findWhere('1318 Ross Ave, Saint Louis, MO 63146')).toBe(
      "ADRNO = 1318 AND STATUS = 'Current' AND (ADRSTR LIKE '%ROSS%')",
    );
  });

  it('skips a leading direction and a trailing street type, and picks the first plain word', () => {
    expect(findWhere('1750 N Geyer Rd')).toBe(
      "ADRNO = 1750 AND STATUS = 'Current' AND (ADRSTR LIKE '%GEYER%')",
    );
    expect(findWhere('17476 Chesterfield Airport Rd 63005')).toContain("'%CHESTERFIELD%'");
    expect(findWhere('1417 Saint Louis Galleria Street')).toContain("(ADRSTR LIKE '%LOUIS%')");
    // A town typed with no comma comes after the street, so it is never picked.
    expect(findWhere('1318 Ross Ave Saint Louis 63146')).toContain("(ADRSTR LIKE '%ROSS%')");
  });

  it('asks for every county spelling when only a word with variants is left', () => {
    expect(findWhere('5 Mount Ave')).toBe(
      "ADRNO = 5 AND STATUS = 'Current' AND (ADRSTR LIKE '%MOUNT%' OR ADRSTR LIKE '%MT%')",
    );
    expect(findWhere('100 First St')).toBe(
      "ADRNO = 100 AND STATUS = 'Current' AND (ADRSTR LIKE '%1%')",
    );
  });

  it('keeps a leading direction word when it is the street name itself', () => {
    expect(findWhere('13272 East Ln')).toBe(
      "ADRNO = 13272 AND STATUS = 'Current' AND (ADRSTR LIKE '%EAST%' OR ADRSTR LIKE '%E%')",
    );
    expect(findWhere('13272 East Lane 63128')).toContain("(ADRSTR LIKE '%EAST%'");
  });

  it('uses a street-type word when the street is named for one', () => {
    expect(findWhere('171 Plaza Dr, Grover 63040')).toBe(
      "ADRNO = 171 AND STATUS = 'Current' AND (ADRSTR LIKE '%PLAZA%' OR ADRSTR LIKE '%PLZ%')",
    );
    expect(findWhere('2626 Center Avenue')).toContain("(ADRSTR LIKE '%CENTER%'");
  });

  it('stops at a unit, so the unit is never the street word', () => {
    expect(findWhere('8025 Md Ave Apt Seventeen')).toContain("(ADRSTR LIKE '%MD%')");
  });

  it('gives null for text with no house number or no street', () => {
    expect(findWhere('Ross Ave')).toBeNull();
    expect(findWhere('1318')).toBeNull();
    expect(findWhere('1318 Ave')).toBeNull();
    expect(findWhere('')).toBeNull();
    expect(findWhere('1234567 Ross Ave')).toBeNull();
  });

  it('never lets typed quotes, wildcards or SQL into the clause', () => {
    const attacks = [
      "1318 Ross' OR '1'='1",
      "1318 R%ss_' ; DROP TABLE x --",
      '1318 Ross") OR 1=1 --',
      '1318 [Ross]',
      "1 OR 1=1 Ross'",
    ];
    for (const text of attacks) {
      const where = findWhere(text);
      expect(where).toMatch(
        /^ADRNO = \d{1,6} AND STATUS = 'Current' AND \(ADRSTR LIKE '%[A-Z0-9]+%'( OR ADRSTR LIKE '%[A-Z0-9]+%')*\)$/,
      );
    }
  });
});

describe('suggestWhere', () => {
  it('asks for current addresses starting with the typed text in county spelling', () => {
    expect(suggestWhere('1318 ross av')).toBe(
      "STATUS = 'Current' AND FULL_ADDRESS LIKE '1318 ROSS AV%'",
    );
    expect(suggestWhere('1318 Ross Avenue ')).toBe(
      "STATUS = 'Current' AND FULL_ADDRESS LIKE '1318 ROSS AVE %'",
    );
    expect(suggestWhere('1318 Ross Avenue')).toBe(
      "STATUS = 'Current' AND FULL_ADDRESS LIKE '1318 ROSS AVE%'",
    );
    expect(suggestWhere('1318 Av')).toBe("STATUS = 'Current' AND FULL_ADDRESS LIKE '1318 AV%'");
    expect(suggestWhere('1417 Saint Louis Galleria')).toBe(
      "STATUS = 'Current' AND FULL_ADDRESS LIKE '1417 ST LOUIS GALLERIA%'",
    );
    expect(suggestWhere('1750 North Geyer')).toBe(
      "STATUS = 'Current' AND FULL_ADDRESS LIKE '1750 N GEYER%'",
    );
  });

  it('adds a typed ZIP after the comma', () => {
    expect(suggestWhere('1318 Ross Ave, 63146')).toBe(
      "STATUS = 'Current' AND FULL_ADDRESS LIKE '1318 ROSS AVE%' AND ZIPCODE = '63146'",
    );
  });

  it('gives null when the text does not start with a house number', () => {
    expect(suggestWhere('Ross Ave')).toBeNull();
    expect(suggestWhere('  ')).toBeNull();
  });

  it('never lets typed quotes or wildcards into the clause', () => {
    for (const text of ["1318 Ro'ss%", "1318 _' OR 1=1 --", "1318 Ross, 63146' OR '1'='1"]) {
      expect(suggestWhere(text)).toMatch(
        /^STATUS = 'Current' AND FULL_ADDRESS LIKE '[A-Z0-9 ]+%'( AND ZIPCODE = '\d{5}')?$/,
      );
    }
  });
});

describe('the request', () => {
  it('POSTs the query, so the address is never in a URL, with no cookies or referrer', async () => {
    const fetch = answering(ROSS);
    await source(fetch).find('1318 Ross Ave, Saint Louis, MO 63146');
    const [{ url, init, params }] = fetch.calls;
    expect(url).toBe(`${LIVE_URL}/query`);
    expect(url).not.toMatch(/ROSS|1318/i);
    expect(init).toMatchObject({
      method: 'POST',
      cache: 'no-store',
      credentials: 'omit',
      referrerPolicy: 'no-referrer',
    });
    expect(init.body).toBeInstanceOf(URLSearchParams);
    expect(init.signal).toBeInstanceOf(AbortSignal);
    expect(params.get('where')).toBe(findWhere('1318 Ross Ave, Saint Louis, MO 63146'));
    expect(params.get('f')).toBe('json');
    expect(params.get('outSR')).toBe('4326');
    expect(params.get('returnGeometry')).toBe('true');
    expect(Number(params.get('resultRecordCount'))).toBeGreaterThan(0);
  });

  it('sends nothing for text with no house number', async () => {
    const fetch = answering(ROSS);
    await expect(source(fetch).find('Ross Ave')).resolves.toEqual({ status: 'none' });
    await expect(source(fetch).suggest('Ross Ave')).resolves.toEqual([]);
    expect(fetch).not.toHaveBeenCalled();
  });
});

describe('find', () => {
  it('matches 1318 Ross Ave to the county point, as a county place', async () => {
    const result = await source(answering(CROSSING, ROSS)).find(
      '1318 Ross Ave, Saint Louis, MO 63146',
    );
    expect(result).toEqual({
      status: 'match',
      confirmed: true,
      place: {
        lat: 38.6822,
        lng: -90.4581,
        state: 'Missouri',
        county: 'Saint Louis County',
        label: '1318 Ross Ave, Saint Louis, MO 63146',
      },
    });
  });

  it('is not confirmed without a ZIP or a town other than St. Louis', async () => {
    const result = await source(answering(ROSS)).find('1318 Ross Ave, St. Louis');
    expect(result).toMatchObject({ status: 'match', confirmed: false });
  });

  it('is confirmed by the typed town when it is not St. Louis', async () => {
    const result = await source(answering(CROSSING)).find('1318 Big Bend Crossing Dr, Valley Park');
    expect(result).toMatchObject({ status: 'match', confirmed: true });
  });

  it('keeps the strict rules: whole street, same direction and type, same ZIP', async () => {
    const find = (text) => source(answering(ROSS)).find(text);
    await expect(find('1318 Ross')).resolves.toEqual({ status: 'none' });
    await expect(find('1318 Ross Ct')).resolves.toEqual({ status: 'none' });
    await expect(find('1318 N Ross Ave')).resolves.toEqual({ status: 'none' });
    await expect(find('1318 Ross Ave, MO 63141')).resolves.toEqual({ status: 'none' });
    await expect(find('1310 Ross Ave')).resolves.toEqual({ status: 'none' });
    await expect(find('1318 Ross Ave, St. Louis City')).resolves.toEqual({ status: 'none' });
  });

  it('needs the town or ZIP for an address in a named town', async () => {
    await expect(source(answering(CROSSING)).find('1318 Big Bend Crossing Dr')).resolves.toEqual({
      status: 'none',
    });
  });

  it('matches county spellings of Saint, Mount and ordinals', async () => {
    const galleria = point({
      ADRNO: 1417,
      ADRSTR: 'ST LOUIS GALLERIA',
      ADRSUF: 'ST',
      ZIPCODE: '63117',
    });
    const mount = point({ ADRNO: 12, ADRSTR: 'MOUNT OLIVE', ADRSUF: 'DR' });
    const first = point({ ADRNO: 9, ADRDIR: 'N', ADRSTR: '1ST', ADRSUF: 'ST' });
    const geyer = point({ ADRNO: 1750, ADRDIR: 'N', ADRSTR: 'GEYER ', ADRSUF: 'RD' });
    const find = (text, record) => source(answering(record)).find(text);
    await expect(find('1417 Saint Louis Galleria St 63117', galleria)).resolves.toMatchObject({
      status: 'match',
      place: { label: '1417 St Louis Galleria St, Saint Louis, MO 63117' },
    });
    await expect(find('12 Mt Olive Drive', mount)).resolves.toMatchObject({ status: 'match' });
    await expect(find('9 North First Street', first)).resolves.toMatchObject({
      status: 'match',
      place: { label: '9 N 1st St, Saint Louis, MO 63146' },
    });
    await expect(find('1750 N Geyer Rd', geyer)).resolves.toMatchObject({ status: 'match' });
  });

  it('matches a street named for a direction', async () => {
    const east = point({ ADRNO: 13272, ADRSTR: 'EAST', ADRSUF: 'LN', ZIPCODE: '63128' });
    await expect(source(answering(east)).find('13272 East Lane 63128')).resolves.toMatchObject({
      status: 'match',
    });
  });

  it('matches county street types like Plaza and Crossing in full or short', async () => {
    const plaza = point({ ADRNO: 20, ADRSTR: 'WEST PORT', ADRSUF: 'PLZ' });
    await expect(source(answering(plaza)).find('20 West Port Plaza')).resolves.toMatchObject({
      status: 'match',
    });
  });

  it('ignores records that are not current or have no usable point', async () => {
    const historical = point({ STATUS: 'Historical' });
    const noPoint = { attributes: ROSS.attributes, geometry: { x: 'a', y: null } };
    await expect(
      source(answering(historical, noPoint)).find('1318 Ross Ave 63146'),
    ).resolves.toEqual({ status: 'none' });
  });

  it('is ambiguous when the same address is in two ZIPs', async () => {
    const main1 = point({
      OBJECTID: 1,
      ADRNO: 100,
      ADRSTR: 'MAIN',
      ADRSUF: 'ST',
      ZIPCODE: '63119',
    });
    const main2 = point(
      { OBJECTID: 2, ADRNO: 100, ADRSTR: 'MAIN', ADRSUF: 'ST', ZIPCODE: '63122' },
      [-90.2, 38.5],
    );
    await expect(source(answering(main1, main2)).find('100 Main St')).resolves.toEqual({
      status: 'ambiguous',
    });
    // A ZIP picks one.
    await expect(source(answering(main1, main2)).find('100 Main St 63122')).resolves.toMatchObject({
      status: 'match',
      place: { lat: 38.5 },
    });
  });

  describe('units', () => {
    const unit = (no, objectId, xy) =>
      point(
        {
          OBJECTID: objectId,
          ADRNO: 8025,
          ADRSTR: 'MARYLAND',
          UNITDESC: 'APT',
          UNITNO: no,
          ZIPCODE: '63105',
          FULL_ADDRESS: `8025 MARYLAND AVE APT ${no}`,
        },
        xy,
      );
    const building = point(
      { OBJECTID: 9, ADRNO: 8025, ADRSTR: 'MARYLAND', ZIPCODE: '63105' },
      [-90.3409, 38.6522],
    );
    const a5 = unit('5A', 3, [-90.34087, 38.65221]);
    const b13 = unit('13B', 4, [-90.34077, 38.65246]);

    it('are one place: the building without a unit typed', async () => {
      const result = await source(answering(a5, b13, building)).find('8025 Maryland Ave 63105');
      expect(result).toMatchObject({
        status: 'match',
        place: { lat: 38.6522, label: '8025 Maryland Ave, Saint Louis, MO 63105' },
      });
    });

    it('pick the typed unit when it exists', async () => {
      const result = await source(answering(a5, b13, building)).find(
        '8025 Maryland Ave Apt 13B, 63105',
      );
      expect(result).toMatchObject({
        status: 'match',
        place: { lat: 38.65246, label: '8025 Maryland Ave Apt 13B, Saint Louis, MO 63105' },
      });
    });

    it('may start with a letter', async () => {
      const n230 = point({
        ADRNO: 6,
        ADRSTR: 'MILLSTONE CAMPUS',
        ADRSUF: 'DR',
        UNITDESC: 'APT',
        UNITNO: 'N230',
      });
      const result = await source(answering(n230)).find(
        '6 Millstone Campus Dr Apt N230, Saint Louis, MO 63146',
      );
      expect(result).toMatchObject({
        status: 'match',
        place: { label: '6 Millstone Campus Dr Apt N230, Saint Louis, MO 63146' },
      });
    });

    it('fall back to a unit of the building when there is no building record', async () => {
      const result = await source(answering(a5, b13)).find('8025 Maryland Ave #7, 63105');
      expect(result).toMatchObject({
        status: 'match',
        place: { label: '8025 Maryland Ave, Saint Louis, MO 63105' },
      });
    });

    it('on a large parcel, far apart, still have the building point as the address', async () => {
      const far = unit('99', 5, [-90.3, 38.7]);
      const result = await source(answering(a5, far, building)).find('8025 Maryland Ave 63105');
      expect(result).toMatchObject({ status: 'match', place: { lat: 38.6522 } });
    });

    it('are not one place when they are far apart and there is no building point', async () => {
      const far = unit('99', 5, [-90.3, 38.7]);
      await expect(source(answering(a5, far)).find('8025 Maryland Ave 63105')).resolves.toEqual({
        status: 'ambiguous',
      });
    });
  });

  it('treats an answer cut off at the record limit as no answer', async () => {
    const fetch = fakeFetch(() => respond({ features: [ROSS], exceededTransferLimit: true }));
    await expect(source(fetch).find('1318 Ross Ave 63146')).rejects.toBeInstanceOf(
      GeocoderUnavailableError,
    );
  });
});

describe('failures', () => {
  const cases = [
    ['an HTTP error', () => respond({}, { status: 403 })],
    ['an ArcGIS error body', () => respond({ error: { code: 400, message: 'bad' } })],
    ['a body with no features', () => respond({ nope: true })],
    [
      'a body that is not JSON',
      () => ({ ok: true, status: 200, json: async () => JSON.parse('<') }),
    ],
    ['a network error', () => Promise.reject(new TypeError('Failed to fetch 1318 Ross'))],
  ];

  it.each(cases)(
    'turns %s into GeocoderUnavailableError without the address',
    async (_, answer) => {
      const error = await source(fakeFetch(answer))
        .find('1318 Ross Ave 63146')
        .catch((e) => e);
      expect(error).toBeInstanceOf(GeocoderUnavailableError);
      expect(error.message).not.toMatch(/1318|Ross/i);
      const suggestError = await source(fakeFetch(answer))
        .suggest('1318 Ross')
        .catch((e) => e);
      expect(suggestError).toBeInstanceOf(GeocoderUnavailableError);
    },
  );

  it('times out after its own short timeout', async () => {
    vi.useFakeTimers();
    try {
      const fetch = fakeFetch(() => new Promise(() => {}));
      const pending = source(fetch, { timeoutMs: 2500 })
        .find('1318 Ross Ave 63146')
        .catch((e) => e);
      await vi.advanceTimersByTimeAsync(2500);
      const error = await pending;
      expect(error).toBeInstanceOf(GeocoderUnavailableError);
      expect(error.message).toMatch(/timed out/);
      expect(fetch.calls[0].init.signal.aborted).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });

  it('rejects with an AbortError when the caller aborts', async () => {
    const fetch = fakeFetch(() => new Promise(() => {}));
    const controller = new AbortController();
    const pending = source(fetch)
      .find('1318 Ross Ave', { signal: controller.signal })
      .catch((e) => e);
    controller.abort();
    expect((await pending).name).toBe('AbortError');
  });

  it('sends nothing when the signal is already aborted', async () => {
    const fetch = answering(ROSS);
    const controller = new AbortController();
    controller.abort();
    const error = await source(fetch)
      .suggest('1318 Ross', { signal: controller.signal })
      .catch((e) => e);
    expect(error.name).toBe('AbortError');
    expect(fetch).not.toHaveBeenCalled();
  });
});

describe('suggest', () => {
  it('lists county addresses with readable labels and their places', async () => {
    const fetch = answering(ROSS, CROSSING);
    const suggestions = await source(fetch).suggest('1318 ross');
    expect(fetch.calls[0].params.get('where')).toBe(suggestWhere('1318 ross'));
    expect(suggestions.map((s) => s.label)).toEqual([
      '1318 Ross Ave, Saint Louis, MO 63146',
      '1318 Big Bend Crossing Dr, Valley Park, MO 63088',
    ]);
    expect(suggestions[0].place).toEqual({
      lat: 38.6822,
      lng: -90.4581,
      state: 'Missouri',
      county: 'Saint Louis County',
      label: '1318 Ross Ave, Saint Louis, MO 63146',
    });
    expect(new Set(suggestions.map((s) => s.id)).size).toBe(2);
  });

  it('collapses the units of one building unless a unit is typed', async () => {
    const units = ['10A', '10B', '10C'].map((no, i) =>
      point({
        OBJECTID: 10 + i,
        ADRNO: 8025,
        ADRSTR: 'MARYLAND',
        UNITDESC: 'APT',
        UNITNO: no,
        ZIPCODE: '63105',
        FULL_ADDRESS: `8025 MARYLAND AVE APT ${no}`,
      }),
    );
    const collapsed = await source(answering(...units)).suggest('8025 Maryl');
    expect(collapsed.map((s) => s.label)).toEqual(['8025 Maryland Ave, Saint Louis, MO 63105']);
    const listed = await source(answering(...units)).suggest('8025 Maryland Ave Apt 10');
    expect(listed.map((s) => s.label)).toEqual([
      '8025 Maryland Ave Apt 10A, Saint Louis, MO 63105',
      '8025 Maryland Ave Apt 10B, Saint Louis, MO 63105',
      '8025 Maryland Ave Apt 10C, Saint Louis, MO 63105',
    ]);
  });

  it('shows at most five', async () => {
    const many = Array.from({ length: 9 }, (_, i) =>
      point({ OBJECTID: i, ADRNO: 1310 + i, FULL_ADDRESS: `${1310 + i} ROSS AVE` }),
    );
    expect(await source(answering(...many)).suggest('131')).toHaveLength(5);
  });
});
