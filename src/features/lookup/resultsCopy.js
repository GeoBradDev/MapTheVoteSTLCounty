// All the results screen text. The text is in src/i18n/en.json (#19). Facts
// about the voter's precinct come from the county's data, never from here.
import { t as currentT, translated } from '../../i18n/index.js';
import { formatLongDate } from './earlyVoting.js';

/**
 * A 24-hour HH:MM time as voters read it: 06:00 is "6 a.m.", 16:30 is "4:30 p.m.".
 * @param {string} time
 */
export function formatTime(time) {
  const [hours, minutes] = time.split(':').map(Number);
  const period = currentT(hours < 12 ? 'time.am' : 'time.pm');
  const hour = hours % 12 === 0 ? 12 : hours % 12;
  return minutes
    ? currentT('time.hourMinute', { hour, minute: String(minutes).padStart(2, '0'), period })
    : currentT('time.hour', { hour, period });
}

/**
 * Link text for an official source: its publisher's name by host, else the host.
 * @param {string} url
 */
export function sourceName(url) {
  let host;
  try {
    host = new URL(url).host;
  } catch {
    return copy.polls.source;
  }
  return copy.polls.sourceNames[host] ?? host;
}

// The district rows that have a label, in en.json's order. `ward`: some cities
// number council districts instead of wards, such as "City of Ellisville
// District 1".
const DISTRICT_KEYS = [
  'congressional',
  'stateSenate',
  'stateHouse',
  'countyCouncil',
  'municipality',
  'ward',
  'township',
  'school',
  'juniorCollege',
  'fire',
  'ambulance',
  'ambulanceSubdistrict',
  'library',
  'sewer',
  'light',
  'road',
  'communityImprovement',
  'business',
  'transportation',
  'neighborhoodImprovement',
  'annexation',
];

export const copy = translated((t) => ({
  /** @param {string} code */
  heading: (code) => t('results.heading', { code }),
  // For a URL whose text is not a precinct code: never echo that text.
  notFoundHeading: t('results.notFoundHeading'),
  unincorporated: t('results.unincorporated'),
  searchAnother: t('results.searchAnother'),
  /** @param {string} code */
  ready: (code) => t('results.ready', { code }),
  officialLookup: t('results.officialLookup'),
  /** @param {string} code The browser tab's title on a precinct's page. */
  pageTitle: (code) => t('results.pageTitle', { code }),
  // The tab title for a code that is not found, or URL text that is not a code.
  notFoundTitle: t('results.notFoundTitle'),
  // Under a precinct code that was not found: search instead.
  searchInstead: t('results.searchInstead'),
  share: {
    button: t('results.share.button'),
    /** @param {string} code The share sheet's title. */
    title: (code) => t('results.share.title', { code }),
    /** @param {string} code */
    note: (code) => t('results.share.note', { code }),
    copied: t('results.share.copied'),
    manual: t('results.share.manual'),
  },
  status: {
    label: t('results.status.label'),
    nonresidentialFallback: t('results.status.nonresidentialFallback'),
    countySite: t('results.status.countySite'),
    notInElection: t('results.status.notInElection'),
    unknown: t('results.status.unknown'),
  },
  cards: {
    polls: t('results.cards.polls'),
    ballot: t('results.cards.ballot'),
    earlyVoting: t('results.cards.earlyVoting'),
    districts: t('results.cards.districts'),
    // For a card that is not built yet.
    pending: t('results.cards.pending'),
  },
  polls: {
    listLabel: t('results.polls.listLabel'),
    /** @param {string} code */
    fromCenter: (code) => t('results.polls.fromCenter', { code }),
    /** @param {string | null} loc */
    unnamed: (loc) =>
      loc ? t('results.polls.unnamedWithLoc', { loc }) : t('results.polls.unnamed'),
    /** @param {number} miles */
    distance: (miles) => {
      if (miles < 0.05) return t('results.polls.lessThanTenth');
      const rounded = miles.toFixed(1);
      // The plural follows the number as shown: "1.0 mile", "0.9 miles".
      return t('results.polls.distance', { miles: rounded, count: Number(rounded) });
    },
    /** @param {string | null} address @param {string | null} zip */
    address: (address, zip) => [address, zip && `MO ${zip}`].filter(Boolean).join(', '),
    directions: t('results.polls.directions'),
    appleMaps: t('results.polls.appleMaps'),
    /** @param {string} name For screen readers: which place the link is for. */
    linkTarget: (name) => t('results.polls.linkTarget', { name }),
    showMore: t('results.polls.showMore'),
    hoursLabel: t('results.polls.hoursLabel'),
    /** @param {string} open HH:MM @param {string} close HH:MM */
    // No closing period: every time already ends in "a.m." or "p.m.".
    hours: (open, close) =>
      t('results.polls.hours', { open: formatTime(open), close: formatTime(close) }),
    /** @param {string} close HH:MM */
    inLine: (close) => t('results.polls.inLine', { close: formatTime(close) }),
    // County data assigns no polling place to a precinct (#72).
    nearestNote: t('results.polls.nearestNote'),
    earlyVotingPointer: t('results.polls.earlyVotingPointer'),
    // Before the voter ID topic's title, which is the link (#23).
    beforeYouGo: t('results.polls.beforeYouGo'),
    source: t('results.polls.source'),
    // Link text for a source, by its host. Anything else shows its host.
    sourceNames: {
      'revisor.mo.gov': t('results.polls.sourceNames.missouriLaw'),
      'stlouiscountymo.gov': t('results.polls.sourceNames.countyBoard'),
      // The county's own ArcGIS apps, such as its Absentee Voting Lookup.
      'stlouiscovotes.maps.arcgis.com': t('results.polls.sourceNames.countyBoard'),
    },
    /**
     * After a refresh of a list already shown fails (#84).
     * @param {string} time HH:MM when the list loaded.
     * @param {string | null} date YYYY-MM-DD when that was not today.
     */
    // No closing period: every time already ends in "a.m." or "p.m.".
    staleNote: (time, date) =>
      date
        ? t('results.polls.staleNoteOnDate', {
            date: formatLongDate(date),
            time: formatTime(time),
          })
        : t('results.polls.staleNote', { time: formatTime(time) }),
    failed: t('results.polls.failed'),
    none: t('results.polls.none'),
  },
  ballot: {
    // Neutral on purpose: what the document holds, nothing about candidates.
    intro: t('results.ballot.intro'),
    open: t('results.ballot.open'),
    // Read after the link text and file name by screen readers only. The
    // county serves the PDF as a download, so most browsers save it rather
    // than show it in the new tab.
    newTab: t('results.ballot.newTab'),
    missing: t('results.ballot.missing'),
  },
  earlyVoting: {
    // Only the county's dates, hours and sites; no eligibility rules here.
    intro: t('results.earlyVoting.intro'),
    groupsLabel: t('results.earlyVoting.groupsLabel'),
    // Keyed by the polls layer's `abs_type`, like the schedules in the config.
    groups: {
      boe: t('results.earlyVoting.groups.boe'),
      abs: t('results.earlyVoting.groups.abs'),
    },
    siteKinds: {
      boe: t('results.earlyVoting.siteKinds.boe'),
      abs: t('results.earlyVoting.siteKinds.abs'),
    },
    // No closing period after a time: every time already ends in "a.m." or "p.m.".
    /** @param {import('./earlyVoting.js').EarlyVotingStatus} status @param {(date: string) => string} longDate */
    status: (status, longDate) => {
      switch (status.kind) {
        case 'openNow':
          return t('results.earlyVoting.status.openNow', { close: formatTime(status.close) });
        case 'opensToday':
          return t('results.earlyVoting.status.opensToday', { open: formatTime(status.open) });
        case 'opensOn':
          return t('results.earlyVoting.status.opensOn', {
            date: longDate(status.date),
            open: formatTime(status.open),
          });
        default:
          return t('results.earlyVoting.status.ended');
      }
    },
    /** @param {{ weekdaysOnly: boolean, from: string, to: string | null }} line */
    days: ({ weekdaysOnly, from, to }) => {
      if (!to) return from;
      return t(weekdaysOnly ? 'results.earlyVoting.weekdays' : 'results.earlyVoting.range', {
        from,
        to,
      });
    },
    /** @param {string} open HH:MM @param {string} close HH:MM */
    hours: (open, close) =>
      t('results.earlyVoting.hours', { open: formatTime(open), close: formatTime(close) }),
    /** @param {string} date Already formatted. */
    lastVerified: (date) => t('results.earlyVoting.lastVerified', { date }),
    listLabel: t('results.earlyVoting.listLabel'),
    /** @param {number} count */
    showAll: (count) => t('results.earlyVoting.showAll', { count }),
    note: t('results.earlyVoting.note'),
    // Then the absentee topic's title as the link (#23), or "How to vote" until
    // that topic exists, and the county's site as the official place to read more.
    mail: t('results.earlyVoting.mail'),
    howToVote: t('results.earlyVoting.howToVote'),
    or: t('results.earlyVoting.or'),
    countySite: t('results.earlyVoting.countySite'),
    failed: t('results.earlyVoting.failed'),
    none: t('results.earlyVoting.none'),
  },
  districts: {
    // Row labels, keyed like `districtFields` in the election config. Values
    // come from the county's precinct data and are not translated.
    labels: Object.fromEntries(
      DISTRICT_KEYS.map((key) => [key, t(`results.districts.labels.${key}`)]),
    ),
    source: t('results.districts.source'),
    missing: t('results.districts.missing'),
  },
  map: {
    /** @param {string} code */
    label: (code) => t('results.map.label', { code }),
    /** @param {string} code */
    legend: (code) => t('results.map.legend', { code }),
    origin: t('results.map.origin'),
    basemap: t('results.map.basemap'),
    data: t('results.map.data'),
    county: t('results.map.county'),
  },
  errors: {
    notFound: t('results.errors.notFound'),
    failed: t('results.errors.failed'),
    offline: t('results.errors.offline'),
  },
}));
