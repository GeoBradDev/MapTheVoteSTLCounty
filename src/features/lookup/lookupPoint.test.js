import {
  forgetLookupPoint,
  lookupFromDevice,
  lookupPointFor,
  rememberLookupPoint,
} from './lookupPoint.js';

describe('lookupPoint', () => {
  it('gives the point back only for the precinct it was found in', () => {
    rememberLookupPoint('CC007', { lat: 38.66, lng: -90.45 });
    expect(lookupPointFor('CC007')).toEqual({ lat: 38.66, lng: -90.45 });
    expect(lookupPointFor('OAK019')).toBeNull();
  });

  it('keeps only the latest lookup', () => {
    rememberLookupPoint('CC007', { lat: 38.66, lng: -90.45 });
    rememberLookupPoint('OAK019', { lat: 38.5, lng: -90.3 });
    expect(lookupPointFor('CC007')).toBeNull();
    expect(lookupPointFor('OAK019')).toEqual({ lat: 38.5, lng: -90.3 });
  });

  it('keeps only the coordinates, as a copy', () => {
    const place = { lat: 38.5, lng: -90.3, label: '7700 Fine Rd' };
    rememberLookupPoint('OAK019', place);
    place.lat = 0;
    expect(lookupPointFor('OAK019')).toEqual({ lat: 38.5, lng: -90.3 });
  });

  it('ignores a point without numeric coordinates', () => {
    rememberLookupPoint('OAK019', { lat: 38.5, lng: -90.3 });
    rememberLookupPoint('CC007', { lat: 'x', lng: -90.3 });
    expect(lookupPointFor('CC007')).toBeNull();
    expect(lookupPointFor('OAK019')).toBeNull();
  });

  // #216: the precinct page says a device's location may not be home.
  it('says whether the point came from the device, for its precinct only', () => {
    rememberLookupPoint('CC007', { lat: 38.66, lng: -90.45 }, { device: true });
    expect(lookupFromDevice('CC007')).toBe(true);
    expect(lookupFromDevice('OAK019')).toBe(false);
    rememberLookupPoint('CC007', { lat: 38.66, lng: -90.45 });
    expect(lookupFromDevice('CC007')).toBe(false);
  });

  it('forgets the device mark with the point', () => {
    rememberLookupPoint('CC007', { lat: 38.66, lng: -90.45 }, { device: true });
    forgetLookupPoint();
    expect(lookupFromDevice('CC007')).toBe(false);
  });
});
