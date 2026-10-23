// All the wait times page text (#104). The text is in src/i18n/en.json (#19).
// Dates, hours, board names and links come from src/config/election.js, never
// from here. Neutral on purpose: a sort is a sort, and no site is called
// better, worse or recommended.
import { translated } from '../../i18n/index.js';
import { formatLongDate } from '../lookup/earlyVoting.js';
import { formatTime } from '../lookup/resultsCopy.js';

export const copy = translated((t) => ({
  heading: t('waitTimes.heading'),
  intro: t('waitTimes.intro'),
  season: {
    /** @param {string} from YYYY-MM-DD @param {string} to YYYY-MM-DD */
    before: (from, to) =>
      t('waitTimes.season.before', { from: formatLongDate(from), to: formatLongDate(to) }),
    ended: t('waitTimes.season.ended'),
    findPollingPlace: t('waitTimes.season.findPollingPlace'),
  },
  status: {
    // No closing period: every time already ends in "a.m." or "p.m.".
    /** @param {string} time HH:MM */
    checked: (time) => t('waitTimes.status.checked', { time: formatTime(time) }),
    unavailable: t('waitTimes.status.unavailable'),
  },
  /** @param {number} seconds */
  refresh: (seconds) => t('waitTimes.refresh', { seconds }),
  // No closing period: every time already ends in "a.m." or "p.m.".
  /** @param {number} count @param {string} time HH:MM */
  count: (count, time) => t('waitTimes.count', { count, time: formatTime(time) }),
  noCount: t('waitTimes.noCount'),
  /** @param {string} board */
  reportedBy: (board) => t('waitTimes.reportedBy', { board }),
  /** @param {string} open HH:MM @param {string} close HH:MM */
  todayHours: (open, close) =>
    t('waitTimes.todayHours', { open: formatTime(open), close: formatTime(close) }),
  sort: {
    legend: t('waitTimes.sort.legend'),
    line: t('waitTimes.sort.line'),
    name: t('waitTimes.sort.name'),
    nearest: t('waitTimes.sort.nearest'),
    /** @param {number} miles */
    nearby: (miles) => t('waitTimes.sort.nearby', { miles }),
  },
  location: {
    button: t('waitTimes.location.button'),
    busy: t('waitTimes.location.busy'),
    privacy: t('waitTimes.location.privacy'),
    errors: {
      denied: t('waitTimes.location.errors.denied'),
      timeout: t('waitTimes.location.errors.timeout'),
      unavailable: t('waitTimes.location.errors.unavailable'),
      insecure: t('waitTimes.location.errors.insecure'),
      unsupported: t('waitTimes.location.errors.unsupported'),
      coarse: t('waitTimes.location.errors.coarse'),
    },
  },
  listLabel: t('waitTimes.listLabel'),
  failed: t('waitTimes.failed'),
  none: t('waitTimes.none'),
  map: {
    show: t('waitTimes.map.show'),
    hide: t('waitTimes.map.hide'),
    label: t('waitTimes.map.label'),
    numbers: t('waitTimes.map.numbers'),
    legend: t('waitTimes.map.legend'),
    /** @param {{ min: number, max: number | null }} bin */
    bin: ({ min, max }) =>
      max === null ? t('waitTimes.map.binOpen', { min }) : t('waitTimes.map.bin', { min, max }),
    noCount: t('waitTimes.map.noCount'),
  },
  city: t('waitTimes.city'),
  // The page on Election Day (#107): every polling place of both boards.
  electionDay: {
    heading: t('waitTimes.electionDay.heading'),
    intro: t('waitTimes.electionDay.intro'),
    city: t('waitTimes.electionDay.city'),
    listLabel: t('waitTimes.electionDay.listLabel'),
    // No closing period: every time already ends in "a.m." or "p.m.".
    /** @param {string} close HH:MM */
    closed: (close) => t('waitTimes.electionDay.closed', { close: formatTime(close) }),
    failed: t('waitTimes.electionDay.failed'),
    none: t('waitTimes.electionDay.none'),
    mapLabel: t('waitTimes.electionDay.mapLabel'),
    /** @param {string} board From the config. */
    countyLink: (board) => t('waitTimes.electionDay.countyLink', { board }),
  },
  /** @param {string} board From the config. */
  cityLink: (board) => t('waitTimes.cityLink', { board }),
  disclaimer: t('waitTimes.disclaimer'),
  sources: t('waitTimes.sources'),
  /** @param {string} board From the config. */
  countyLink: (board) => t('waitTimes.countyLink', { board }),
  backHome: t('waitTimes.backHome'),
}));
