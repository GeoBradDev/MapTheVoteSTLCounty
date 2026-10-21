// The privacy notice (issue #20), kept in one file so the i18n work (#19) can
// move it to en.json without touching the markup. It must stay true of the
// code: when the app starts calling a new service, or changes what it sends or
// keeps, change this notice in the same change. PrivacyPage.test.jsx fails when
// render.yaml's connect-src allows an origin this notice does not name.
import election from '../../config/election.js';
import { attribution } from '../../data/geocoder.js';
import { BASEMAP_STYLE_URL } from '../lookup/basemap.js';

const host = (url) => new URL(url).host;

// The backup address search service. Only the geocoder modules may name a
// provider, so its name and link come from there. #49 moves them from
// `attribution` to `attribution.fallback`; this reads either shape.
const backup = attribution.fallback ?? attribution;

/** Host names the notice names, so a reader can match them to network requests. */
export const hosts = Object.freeze({
  // St. Louis County's address points: the county's own server and the copy
  // it hosts on ArcGIS Online (#49).
  countyAddress: ['maps.stlouisco.com', 'services2.arcgis.com'],
  backup: host(backup.serviceUrl),
  electionMaps: host(election.serviceRoot),
  basemap: host(BASEMAP_STYLE_URL),
});

export const copy = {
  heading: 'Privacy',
  intro:
    'This site helps you find your precinct, polling places and sample ballot. It has no accounts, no analytics and no server of its own: your browser talks straight to the public services below. Here is what each one gets, and what this site never keeps.',

  never: {
    heading: 'What this site never does',
    items: [
      'It never saves your address or your location. They are not put in the page address (URL), in browser storage or in cookies, and they are gone when you search again or close the page.',
      'It has no analytics, ads or tracking, and sets no cookies.',
      'A shared link holds only your precinct code, like /p/CC007, never your address.',
    ],
  },

  sent: {
    heading: 'What is sent where',
    intro:
      'Each service below sees your IP address, as any website you visit does, and keeps its own logs under its own policy.',
    items: [
      {
        heading: 'Address search',
        text: `What you type in the address box goes to St. Louis County's address service (${hosts.countyAddress.join(' and ')}) and, as a backup, to ${backup.service} by ${backup.serviceBy} (${hosts.backup}). Suggestions are looked up as you type, so these services get each part of the address as you type it. ${backup.service} gets it as part of the request's web address.`,
      },
      {
        heading: 'Finding your precinct',
        text: `The point where your address was found, or your device's location if you choose Use my location, goes to St. Louis County's election maps on Esri's ArcGIS Online (${hosts.electionMaps}). The coordinates are part of the request's web address, so the service may record them in its logs, and your browser may keep the answer in its ordinary cache until you clear your browsing data. Opening a shared link sends only the precinct code.`,
      },
      {
        heading: 'Use my location',
        text: 'Your browser asks before it shares your location. The site uses it only to find your precinct and the polling places nearest you.',
      },
      {
        heading: 'The map',
        text: `The map's streets and labels come from OpenFreeMap (${hosts.basemap}). Those requests show which area is on screen: your precinct and the polling places near it.`,
      },
      {
        heading: 'This website',
        text: 'Render, which hosts this site, sees which pages you open, like /p/CC007, as any web host does.',
      },
    ],
  },

  links: {
    heading: 'Links to other sites',
    text: 'Links to the county and other official sites take you to those sites. They are not told which page of this site you came from.',
  },

  backHome: 'Back to home',
};
