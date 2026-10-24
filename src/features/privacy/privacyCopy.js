// The privacy notice (issue #20). The text is in src/i18n/en.json (#19). It
// must stay true of the code: when the app starts calling a new service, or
// changes what it sends or keeps, change this notice in the same change. PrivacyPage.test.jsx fails when
// render.yaml's connect-src allows an origin this notice does not name.
// render.yaml names Google Analytics' hosts only once its ID is set (#191).
//
// Google Analytics (#69) follows its config: while the measurement ID in
// src/config/site.js is empty, nothing loads and the notice says the site has
// no analytics; once it is set, the notice names Google's hosts and says what
// they get (PrivacyPage.analytics.test.jsx). The pre-rendered /privacy page is
// built from the same config, so the two always match.
import { ANALYTICS_HOSTS, analyticsEnabled } from '../../analytics/index.js';
import election, { jurisdictions } from '../../config/election.js';
import { CITY_GEOCODER_URL } from '../../data/cityAddress.js';
import { HOSTED_URL, LIVE_URL } from '../../data/countyAddress.js';
import { attribution } from '../../data/geocoder.js';
import { translated } from '../../i18n/index.js';
import { BASEMAP_STYLE_URL } from '../lookup/basemap.js';

const host = (url) => new URL(url).host;

// The address search services. Only the geocoder modules may name a
// provider, so the names, links and hosts come from there: St. Louis County's
// address points first (its live layer, then its hosted copy), the open
// service after them, and the City of St. Louis's geocoder, a source for City
// addresses (#88) and the City check (src/data/geocoder.js).
const openSearch = attribution.fallback;

/** Host names the notice names, so a reader can match them to network requests. */
export const hosts = Object.freeze({
  countyAddresses: host(LIVE_URL),
  countyAddressesCopy: host(HOSTED_URL),
  cityAddresses: host(CITY_GEOCODER_URL),
  openSearch: host(openSearch.serviceUrl),
  electionMaps: host(election.serviceRoot),
  cityElectionMaps: host(jurisdictions.city.serviceRoot),
  basemap: host(BASEMAP_STYLE_URL),
  // The County's Election Day line counts (#107) may come from another org.
  countyWaits: [
    ...new Set(
      [
        election.waitTimes.county.serviceRoot,
        election.waitTimes.county.electionDay.serviceRoot,
      ].map(host),
    ),
  ].join(', '),
  cityWaits: host(election.waitTimes.city.serviceRoot),
});

export const copy = translated((t) => buildCopy(t, analyticsEnabled()));

function buildCopy(t, analytics) {
  return {
    heading: t('privacy.heading'),
    intro: t(analytics ? 'privacy.introAnalytics' : 'privacy.intro'),

    never: {
      heading: t('privacy.never.heading'),
      items: [
        t('privacy.never.noSaving'),
        t(analytics ? 'privacy.never.noTrackingAnalytics' : 'privacy.never.noTracking'),
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
          text: t('privacy.sent.findingPrecinct.text', {
            electionMaps: hosts.electionMaps,
            cityElectionMaps: hosts.cityElectionMaps,
          }),
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
          // The wait times page (#104) and, while early voting runs, the results
          // page's early voting card (#105) read both boards' line count layers.
          heading: t('privacy.sent.waitTimes.heading'),
          text: t('privacy.sent.waitTimes.text', {
            countyBoard: election.waitTimes.county.source,
            countyLayers: hosts.countyWaits,
            cityBoard: election.waitTimes.city.source,
            cityLayers: hosts.cityWaits,
            seconds: election.waitTimes.refreshSeconds,
          }),
        },
        ...(analytics
          ? [
              {
                heading: t('privacy.sent.analytics.heading'),
                text: t('privacy.sent.analytics.text', {
                  loader: ANALYTICS_HOSTS.loader,
                  collector: ANALYTICS_HOSTS.collector,
                }),
              },
            ]
          : []),
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
  };
}
