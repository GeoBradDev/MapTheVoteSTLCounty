// The privacy notice (issue #20). The text is in src/i18n/en.json (#19). It
// must stay true of the code: when the app starts calling a new service, or
// changes what it sends or keeps, change this notice in the same change. PrivacyPage.test.jsx fails when
// render.yaml's connect-src allows an origin this notice does not name.
import election from '../../config/election.js';
import { CITY_GEOCODER_URL } from '../../data/cityAddress.js';
import { HOSTED_URL, LIVE_URL } from '../../data/countyAddress.js';
import { attribution } from '../../data/geocoder.js';
import { translated } from '../../i18n/index.js';
import { BASEMAP_STYLE_URL } from '../lookup/basemap.js';

const host = (url) => new URL(url).host;

// The address search services. Only the geocoder modules may name a
// provider, so the names, links and hosts come from there: St. Louis County's
// address points first (its live layer, then its hosted copy), the open
// service after them, and the City of St. Louis's geocoder for the City
// check (src/data/geocoder.js).
const openSearch = attribution.fallback;

/** Host names the notice names, so a reader can match them to network requests. */
export const hosts = Object.freeze({
  countyAddresses: host(LIVE_URL),
  countyAddressesCopy: host(HOSTED_URL),
  cityAddresses: host(CITY_GEOCODER_URL),
  openSearch: host(openSearch.serviceUrl),
  electionMaps: host(election.serviceRoot),
  basemap: host(BASEMAP_STYLE_URL),
  countyWaits: host(election.waitTimes.county.serviceRoot),
  cityWaits: host(election.waitTimes.city.serviceRoot),
});

export const copy = translated((t) => ({
  heading: t('privacy.heading'),
  intro: t('privacy.intro'),

  never: {
    heading: t('privacy.never.heading'),
    items: [
      t('privacy.never.noSaving'),
      t('privacy.never.noTracking'),
      t('privacy.never.sharedLink'),
    ],
  },

  sent: {
    heading: t('privacy.sent.heading'),
    intro: t('privacy.sent.intro'),
    items: [
      {
        heading: t('privacy.sent.addressSearch.heading'),
        text: t('privacy.sent.addressSearch.text', {
          countyAddresses: hosts.countyAddresses,
          countyAddressesCopy: hosts.countyAddressesCopy,
          service: openSearch.service,
          serviceBy: openSearch.serviceBy,
          openSearch: hosts.openSearch,
          cityAddresses: hosts.cityAddresses,
        }),
      },
      {
        heading: t('privacy.sent.findingPrecinct.heading'),
        text: t('privacy.sent.findingPrecinct.text', { electionMaps: hosts.electionMaps }),
      },
      {
        heading: t('privacy.sent.useMyLocation.heading'),
        text: t('privacy.sent.useMyLocation.text'),
      },
      {
        heading: t('privacy.sent.map.heading'),
        text: t('privacy.sent.map.text', { basemap: hosts.basemap }),
      },
      {
        // The wait times page (#104) reads both boards' line count layers.
        heading: t('privacy.sent.waitTimes.heading'),
        text: t('privacy.sent.waitTimes.text', {
          countyBoard: election.waitTimes.county.source,
          countyLayers: hosts.countyWaits,
          cityBoard: election.waitTimes.city.source,
          cityLayers: hosts.cityWaits,
          seconds: election.waitTimes.refreshSeconds,
        }),
      },
      {
        heading: t('privacy.sent.website.heading'),
        text: t('privacy.sent.website.text'),
      },
    ],
  },

  links: {
    heading: t('privacy.links.heading'),
    text: t('privacy.links.text'),
  },

  backHome: t('privacy.backHome'),
}));
