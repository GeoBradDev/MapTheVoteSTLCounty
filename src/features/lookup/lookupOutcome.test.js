// The lookup's outcome kinds as the fixed labels Google Analytics gets (#70).
import { trackEvents } from '../../test/trackedEvents.js';
import { trackDeviceFailure, trackLookup } from './lookupOutcome.js';

let tracked;
beforeEach(() => {
  tracked = trackEvents();
});
afterEach(() => tracked.stop());

const outcomes = async () => (await tracked.events()).map(([, params]) => params);

describe('trackLookup', () => {
  it.each([
    ['precinct', 'precinct'],
    ['county-unmatched', 'no_precinct'],
    ['stl-city', 'city_referral'],
    ['missouri', 'out_of_area'],
    ['out-of-state', 'out_of_area'],
    ['unknown', 'out_of_area'],
    ['noMatch', 'no_match'],
    ['unavailable', 'unavailable'],
    ['failed', 'failed'],
    ['offline', 'offline'],
  ])('counts %s as %s', async (kind, outcome) => {
    trackLookup('address', kind);
    trackLookup('location', kind);
    expect(await tracked.events()).toEqual([
      ['lookup_result', { source: 'address', outcome }],
      ['lookup_result', { source: 'location', outcome }],
    ]);
  });

  it('sends nothing for a kind it does not know', async () => {
    trackLookup('address', 'CC007');
    trackLookup('address', 'toString');
    expect(await tracked.events()).toEqual([]);
  });
});

describe('trackDeviceFailure', () => {
  it.each([
    ['denied', 'denied'],
    ['timeout', 'timeout'],
    ['coarse', 'coarse'],
    ['unavailable', 'unavailable'],
    ['insecure', 'unavailable'],
    ['unsupported', 'unavailable'],
    ['something new', 'unavailable'],
  ])('counts %s as %s', async (reason, outcome) => {
    trackDeviceFailure(reason);
    expect(await outcomes()).toEqual([{ source: 'location', outcome }]);
  });
});
