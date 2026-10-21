import {
  attribution,
  createCountyAddressSource,
  findWhere,
  HOSTED_URL,
  LIVE_URL,
  PRECINCT_CHECK_MS,
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
      MUNI: 'UNI',
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
// The precinct check: every point in one precinct unless a test says otherwise.
const onePrecinct = vi.fn(async () => new Set(['P1']));
const twoPrecincts = async () => new Set(['P1', 'P2']);
const source = (fetch, options) =>
  createCountyAddressSource({ url: LIVE_URL, fetch, precinctsAt: onePrecinct, ...options });

describe('the county layers', () => {
  it('are the live county server first and the hosted copy second', () => {
    expect(LIVE_URL).toBe(
      'https://maps.stlouisco.com/hosting/rest/services/Maps/ASR_Address_Points/FeatureServer/0',
    );
    expect(HOSTED_URL).toBe(
      'https://services2.arcgis.com/w657bnjzrjguNyOy/arcgis/rest/services/Address_Points/FeatureServer/2',
    );
  });

  it('credit St. Louis County and its GIS Service Center with a link to the data', () => {
    expect(attribution.by).toBe('St. Louis County');
    expect(attribution.publisher).toBe('GIS Service Center');
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

  it('treats words like constructor as plain words, not object keys', () => {
    expect(findWhere('100 constructor')).toBe(
      "ADRNO = 100 AND STATUS = 'Current' AND (ADRSTR LIKE '%CONSTRUCTOR%')",
    );
    expect(findWhere('100 toString Ave')).toContain("'%TOSTRING%'");
    expect(suggestWhere('100 constructor ')).toBe(
      "STATUS = 'Current' AND FULL_ADDRESS LIKE '100 CONSTRUCTOR %'",
    );
    expect(suggestWhere('100 n __proto__ hasOwnProperty ')).toBe(
      "STATUS = 'Current' AND FULL_ADDRESS LIKE '100 N PROTO HASOWNPROPERTY %'",
    );
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

  it('keeps a street-type word inside the street name as typed', () => {
    expect(suggestWhere('18771 Olive Street Rd')).toBe(
      "STATUS = 'Current' AND FULL_ADDRESS LIKE '18771 OLIVE STREET RD%'",
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

  describe('an address with more than one record', () => {
    // Live data: 50 Country Club Ln 63033 is two houses, in Black Jack and in
    // Florissant, in precincts SPL021 and SPL026.
    const blackJack = point(
      {
        OBJECTID: 70176,
        ADRNO: 50,
        ADRSTR: 'COUNTRY CLUB',
        ADRSUF: 'LN',
        MAILINGCITY: 'FLORISSANT',
        ZIPCODE: '63033',
        MUNI: 'BKJ',
      },
      [-90.27768, 38.8073],
    );
    const florissant = point(
      {
        OBJECTID: 334368,
        ADRNO: 50,
        ADRSTR: 'COUNTRY CLUB',
        ADRSUF: 'LN',
        MAILINGCITY: 'FLORISSANT',
        ZIPCODE: '63033',
        MUNI: 'FLO',
      },
      [-90.28282, 38.80534],
    );
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

    it('is no match when its records are in two precincts, even with ZIP and town', async () => {
      const result = await source(answering(blackJack, florissant), {
        precinctsAt: twoPrecincts,
      }).find('50 Country Club Ln, Florissant, MO 63033');
      expect(result).toEqual({ status: 'ambiguous' });
    });

    it('asks the precinct layer once, with every distinct point of the address', async () => {
      const precinctsAt = vi.fn(async () => new Set(['P1']));
      const twin = point({ ...a5.attributes, OBJECTID: 5 }, [-90.34087, 38.65221]);
      await source(answering(a5, b13, twin, building), { precinctsAt }).find(
        '8025 Maryland Ave 63105',
      );
      expect(precinctsAt).toHaveBeenCalledTimes(1);
      expect(precinctsAt.mock.calls[0][0]).toHaveLength(3);
    });

    it('answers with the point of the address itself when all are in one precinct', async () => {
      const result = await source(answering(a5, b13, building)).find('8025 Maryland Ave 63105');
      expect(result).toMatchObject({
        status: 'match',
        place: { lat: 38.6522, label: '8025 Maryland Ave, Saint Louis, MO 63105' },
      });
    });

    it('answers with a unit point when there is no record of the address itself', async () => {
      const result = await source(answering(a5, b13)).find('8025 Maryland Ave #7, 63105');
      expect(result).toMatchObject({
        status: 'match',
        place: { label: '8025 Maryland Ave, Saint Louis, MO 63105' },
      });
    });

    it('is no match when its units span two precincts (4005 Ripa Ave)', async () => {
      const result = await source(answering(a5, b13, building), {
        precinctsAt: twoPrecincts,
      }).find('8025 Maryland Ave 63105');
      expect(result).toEqual({ status: 'ambiguous' });
    });

    it('is no match when some records are in St. Louis City and some in the county', async () => {
      // Live data: 6200 Enright Ave 63130, 31 units in University City
      // (UNV004) and 27 in the City, which has no county precinct.
      const uct = point(
        {
          OBJECTID: 1,
          ADRNO: 6200,
          ADRSTR: 'ENRIGHT',
          ZIPCODE: '63130',
          MUNI: 'UCT',
          UNITDESC: 'APT',
          UNITNO: '300',
        },
        [-90.30171, 38.65641],
      );
      const stl = point(
        {
          OBJECTID: 2,
          ADRNO: 6200,
          ADRSTR: 'ENRIGHT',
          ZIPCODE: '63130',
          MUNI: 'STL',
          UNITDESC: 'APT',
          UNITNO: '111',
        },
        [-90.3015, 38.6566],
      );
      const precinctsAt = vi.fn(async () => new Set(['UNV004']));
      await expect(
        source(answering(uct, stl), { precinctsAt }).find('6200 Enright Ave, St. Louis, MO 63130'),
      ).resolves.toEqual({ status: 'ambiguous' });
      await expect(
        source(answering(uct, stl), { precinctsAt }).find('6200 Enright Ave Apt 111, 63130'),
      ).resolves.toMatchObject({ status: 'match', place: { county: 'St. Louis city' } });
    });

    it('is no match when the precinct check takes too long, and stops waiting', async () => {
      vi.useFakeTimers();
      try {
        const pending = source(answering(a5, b13, building), {
          precinctsAt: () => new Promise(() => {}),
        }).find('8025 Maryland Ave 63105');
        await vi.advanceTimersByTimeAsync(PRECINCT_CHECK_MS);
        await expect(pending).resolves.toEqual({ status: 'ambiguous' });
      } finally {
        vi.useRealTimers();
      }
    });

    it('rejects with AbortError when aborted during the precinct check', async () => {
      const controller = new AbortController();
      const pending = source(answering(a5, b13, building), {
        precinctsAt: () => new Promise(() => {}),
      })
        .find('8025 Maryland Ave 63105', { signal: controller.signal })
        .catch((e) => e);
      await new Promise((resolve) => setTimeout(resolve, 0));
      controller.abort();
      expect((await pending).name).toBe('AbortError');
    });

    it('is no match when the precinct check fails', async () => {
      const result = await source(answering(a5, b13, building), {
        precinctsAt: async () => {
          throw new Error('down');
        },
      }).find('8025 Maryland Ave 63105');
      expect(result).toEqual({ status: 'ambiguous' });
    });

    it('needs no precinct check for one record', async () => {
      const precinctsAt = vi.fn(twoPrecincts);
      await expect(
        source(answering(ROSS), { precinctsAt }).find('1318 Ross Ave 63146'),
      ).resolves.toMatchObject({ status: 'match' });
      expect(precinctsAt).not.toHaveBeenCalled();
    });

    it('answers a typed unit that exactly one record has, with no precinct check', async () => {
      const precinctsAt = vi.fn(twoPrecincts);
      const result = await source(answering(a5, b13, building), { precinctsAt }).find(
        '8025 Maryland Ave Apt 13B, 63105',
      );
      expect(result).toMatchObject({
        status: 'match',
        place: { lat: 38.65246, label: '8025 Maryland Ave Apt 13B, Saint Louis, MO 63105' },
      });
      expect(precinctsAt).not.toHaveBeenCalled();
    });

    it('checks every record when the typed unit is not one record', async () => {
      const result = await source(answering(a5, b13, building), {
        precinctsAt: twoPrecincts,
      }).find('8025 Maryland Ave Apt 100, 63105');
      expect(result).toEqual({ status: 'ambiguous' });
    });

    it('lets a unit number start with a letter', async () => {
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

    it('ignores records that are not homes: poles, towers, billboards, ATMs, substations', async () => {
      const others = ['UP', 'CELL TOWER', 'BILLBOARD', 'ATM', 'SUBSTATION'].map((desc, i) =>
        point(
          {
            OBJECTID: 10 + i,
            UNITDESC: desc,
            UNITNO: `X${i}`,
            FULL_ADDRESS: `1318 ROSS AVE ${desc} X${i}`,
          },
          [-90.3, 38.6],
        ),
      );
      const precinctsAt = vi.fn(twoPrecincts);
      await expect(
        source(answering(ROSS, ...others), { precinctsAt }).find('1318 Ross Ave 63146'),
      ).resolves.toMatchObject({ status: 'match', place: { lat: 38.6822 } });
      expect(precinctsAt).not.toHaveBeenCalled();
      await expect(source(answering(...others)).find('1318 Ross Ave 63146')).resolves.toEqual({
        status: 'none',
      });
      expect(await source(answering(...others)).suggest('1318 Ross Ave #')).toEqual([]);
    });
  });

  it('gives St. Louis City records in the county layer the City as their county', async () => {
    const city = point(
      { ADRNO: 1201, ADRSTR: 'MACKLIND', MAILINGCITY: '', ZIPCODE: '63110', MUNI: 'STL' },
      [-90.28, 38.62],
    );
    await expect(source(answering(city)).find('1201 Macklind Ave, 63110')).resolves.toMatchObject({
      status: 'match',
      place: { county: 'St. Louis city', label: '1201 Macklind Ave, St. Louis city, MO 63110' },
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
  it('lists county addresses with readable labels', async () => {
    const fetch = answering(ROSS, CROSSING);
    const suggestions = await source(fetch).suggest('1318 ross');
    expect(fetch.calls[0].params.get('where')).toBe(suggestWhere('1318 ross'));
    expect(suggestions.map((s) => s.label)).toEqual([
      '1318 Ross Ave, Saint Louis, MO 63146',
      '1318 Big Bend Crossing Dr, Valley Park, MO 63088',
    ]);
    expect(new Set(suggestions.map((s) => s.id)).size).toBe(2);
  });

  it('carry no point, so a pick is found again by its label with every rule', async () => {
    const suggestions = await source(answering(ROSS)).suggest('1318 ross');
    expect(suggestions[0]).not.toHaveProperty('place');
    await expect(source(answering(ROSS)).find(suggestions[0].label)).resolves.toMatchObject({
      status: 'match',
      confirmed: true,
      place: { label: '1318 Ross Ave, Saint Louis, MO 63146' },
    });
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

  it('shows the address, not a unit it could not find again, for a unit number with a space', async () => {
    const floor = point({
      ADRNO: 7035,
      ADRSTR: 'AMHERST',
      UNITDESC: 'UNIT',
      UNITNO: '2 FL',
      ZIPCODE: '63130',
      FULL_ADDRESS: '7035 AMHERST AVE UNIT 2 FL',
    });
    const [suggestion] = await source(answering(floor)).suggest('7035 Amherst Ave Unit');
    expect(suggestion.label).toBe('7035 Amherst Ave, Saint Louis, MO 63130');
    await expect(source(answering(floor)).find(suggestion.label)).resolves.toMatchObject({
      status: 'match',
    });
  });

  it('shows at most five', async () => {
    const many = Array.from({ length: 9 }, (_, i) =>
      point({ OBJECTID: i, ADRNO: 1310 + i, FULL_ADDRESS: `${1310 + i} ROSS AVE` }),
    );
    expect(await source(answering(...many)).suggest('131')).toHaveLength(5);
  });
});
