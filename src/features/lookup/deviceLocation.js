// The device's current position for "Use my location", as the coordinates-only
// place locate() takes. Nothing else from the position (accuracy, altitude,
// time) leaves this module, and nothing is stored.

/** How long the browser may take to find the position once allowed, in ms. */
export const LOCATION_TIMEOUT_MS = 15_000;

/**
 * Why the position could not be had.
 * @typedef {'insecure' | 'unsupported' | 'denied' | 'unavailable' | 'timeout'} LocationReason
 */
export class LocationError extends Error {
  /**
   * @param {LocationReason} reason
   * @param {string} [message]
   */
  constructor(reason, message = `location ${reason}`) {
    super(message);
    this.name = 'LocationError';
    this.reason = reason;
  }
}

// GeolocationPositionError codes.
const REASONS = { 1: 'denied', 2: 'unavailable', 3: 'timeout' };

/**
 * Asks the browser for the device's position. Call it only from a user action:
 * it may show the permission prompt.
 * @returns {Promise<{ lat: number, lng: number }>}
 * @throws {LocationError}
 */
export function getDeviceLocation() {
  return new Promise((resolve, reject) => {
    // Browsers allow geolocation only on HTTPS (and localhost). iOS Safari
    // reports an insecure page as a permission error, so check first.
    if (globalThis.isSecureContext === false) {
      reject(new LocationError('insecure'));
      return;
    }
    const geolocation = globalThis.navigator?.geolocation;
    if (!geolocation?.getCurrentPosition) {
      reject(new LocationError('unsupported'));
      return;
    }
    const onSuccess = ({ coords } = {}) => {
      const lat = coords?.latitude;
      const lng = coords?.longitude;
      if (Number.isFinite(lat) && Number.isFinite(lng)) resolve({ lat, lng });
      else reject(new LocationError('unavailable'));
    };
    const onError = (error) => {
      reject(new LocationError(REASONS[error?.code] ?? 'unavailable', error?.message));
    };
    try {
      geolocation.getCurrentPosition(onSuccess, onError, {
        enableHighAccuracy: true,
        timeout: LOCATION_TIMEOUT_MS,
        maximumAge: 0,
      });
    } catch (error) {
      reject(new LocationError('unavailable', error?.message));
    }
  });
}
