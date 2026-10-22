// The device's current position for "Use my location", as the coordinates-only
// place locate() takes. The accuracy is read only to turn away a rough fix;
// nothing else from the position (accuracy, altitude, time) leaves this module,
// and nothing is stored.

/** How long the browser may take to find the position once allowed, in ms. */
export const LOCATION_TIMEOUT_MS = 15_000;

/**
 * The largest accuracy radius, in meters, that may pick a precinct (#83). A
 * laptop's Wi-Fi or IP estimate, or a phone with precise location off, can be
 * kilometers off and land in another precinct or municipality, so a fix less
 * certain than this is turned away instead of shown as the voter's precinct.
 * 100 m keeps typical phone fixes (GPS, or Wi-Fi indoors) working.
 */
export const MAX_ACCURACY_M = 100;

/**
 * Why the position could not be had.
 * @typedef {'insecure' | 'unsupported' | 'denied' | 'unavailable' | 'timeout' | 'coarse'} LocationReason
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
      const accuracy = coords?.accuracy;
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
        reject(new LocationError('unavailable'));
      } else if (!Number.isFinite(accuracy) || accuracy < 0 || accuracy > MAX_ACCURACY_M) {
        // A missing or nonsense accuracy is no promise the fix is close.
        reject(new LocationError('coarse'));
      } else {
        resolve({ lat, lng });
      }
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
