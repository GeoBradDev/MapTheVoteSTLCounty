import { getDeviceLocation, LOCATION_TIMEOUT_MS, LocationError } from './deviceLocation.js';

const POSITION = {
  coords: { latitude: 38.62, longitude: -90.33, accuracy: 12, altitude: null, speed: null },
  timestamp: 1,
};

// Replaces navigator.geolocation with one whose getCurrentPosition runs `respond`.
function mockGeolocation(respond) {
  const getCurrentPosition = vi.fn(respond);
  vi.stubGlobal('navigator', { ...navigator, geolocation: { getCurrentPosition } });
  return getCurrentPosition;
}

function failWith(code) {
  return (_ok, fail) => fail({ code, message: `code ${code}`, PERMISSION_DENIED: 1 });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('getDeviceLocation', () => {
  it('resolves to only the latitude and longitude', async () => {
    mockGeolocation((ok) => ok(POSITION));
    await expect(getDeviceLocation()).resolves.toEqual({ lat: 38.62, lng: -90.33 });
  });

  it('asks for a fresh, high accuracy position with a timeout', async () => {
    const get = mockGeolocation((ok) => ok(POSITION));
    await getDeviceLocation();
    expect(get).toHaveBeenCalledTimes(1);
    expect(get.mock.calls[0][2]).toEqual({
      enableHighAccuracy: true,
      timeout: LOCATION_TIMEOUT_MS,
      maximumAge: 0,
    });
    expect(LOCATION_TIMEOUT_MS).toBeGreaterThan(0);
  });

  it.each([
    [1, 'denied'],
    [2, 'unavailable'],
    [3, 'timeout'],
    [99, 'unavailable'],
  ])('rejects error code %i as %s', async (code, reason) => {
    mockGeolocation(failWith(code));
    const error = await getDeviceLocation().catch((e) => e);
    expect(error).toBeInstanceOf(LocationError);
    expect(error.reason).toBe(reason);
  });

  it('rejects as unsupported when the browser has no geolocation', async () => {
    vi.stubGlobal('navigator', { ...navigator, geolocation: undefined });
    await expect(getDeviceLocation()).rejects.toMatchObject({ reason: 'unsupported' });
  });

  it('rejects as insecure without asking when the page is not on HTTPS', async () => {
    const get = mockGeolocation((ok) => ok(POSITION));
    vi.stubGlobal('isSecureContext', false);
    await expect(getDeviceLocation()).rejects.toMatchObject({ reason: 'insecure' });
    expect(get).not.toHaveBeenCalled();
  });

  it('asks when the page is a secure context', async () => {
    mockGeolocation((ok) => ok(POSITION));
    vi.stubGlobal('isSecureContext', true);
    await expect(getDeviceLocation()).resolves.toEqual({ lat: 38.62, lng: -90.33 });
  });

  it('rejects as unavailable when the position has no usable coordinates', async () => {
    mockGeolocation((ok) => ok({ coords: { latitude: NaN, longitude: -90.33 } }));
    await expect(getDeviceLocation()).rejects.toMatchObject({ reason: 'unavailable' });
  });

  it('rejects as unavailable when getCurrentPosition throws', async () => {
    mockGeolocation(() => {
      throw new Error('blocked');
    });
    await expect(getDeviceLocation()).rejects.toMatchObject({ reason: 'unavailable' });
  });
});
