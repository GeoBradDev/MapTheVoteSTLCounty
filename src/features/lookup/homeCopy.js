// All the home page text. The text is in src/i18n/en.json (#19). Election
// names and dates come from src/config/election.js, never from here.
import { formatCalendarDate, translated } from '../../i18n/index.js';
import { formatLongDate } from './earlyVoting.js';
import { formatTime } from './resultsCopy.js';

export const copy = translated((t) => ({
  heading: t('home.heading'),
  intro: t('home.intro'),
  // Says up front that this is not either board's own site (#71); the footer
  // names the official boards.
  unofficial: t('home.unofficial'),
  // The first action next to the address search (#104).
  waitTimes: t('home.waitTimes'),
  // On Election Day the same page lists the polling places (#107).
  waitTimesElectionDay: t('home.waitTimesElectionDay'),
  // One compact line in the hero (#80), short enough for a 360 px phone.
  /** @param {string} isoDate YYYY-MM-DD @param {string} timeZone */
  electionDay: (isoDate, timeZone) => {
    const formatted = formatCalendarDate(isoDate, {
      weekday: 'short',
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      timeZone,
    });
    return t('home.electionDay', { date: formatted });
  },
  moreInfo: t('home.moreInfo'),
  howToVote: t('home.howToVote'),
  countySite: t('home.countySite'),
  citySite: t('home.citySite'),
  // The line count dot map during early voting and on Election Day (#184).
  waitMap: {
    heading: t('home.waitMap.heading'),
    headingElectionDay: t('home.waitMap.headingElectionDay'),
    mapLink: t('home.waitMap.mapLink'),
    mapLinkElectionDay: t('home.waitMap.mapLinkElectionDay'),
    county: t('home.waitMap.county'),
    city: t('home.waitMap.city'),
    shortest: t('home.waitMap.shortest'),
    /** @param {{ name: string, board: string, count: number }} site */
    site: ({ name, board, count }) => t('home.waitMap.site', { name, board, count }),
    noCounts: t('home.waitMap.noCounts'),
    unavailable: t('home.waitMap.unavailable'),
    /** @param {string} board From the config. */
    boardUnavailable: (board) => t('home.waitMap.boardUnavailable', { board }),
    // No closing period: every time already ends in "a.m." or "p.m.".
    /** @param {string} time HH:MM */
    openToday: (time) => t('home.waitMap.openToday', { time: formatTime(time) }),
    /** @param {string} date YYYY-MM-DD @param {string} time HH:MM */
    openOn: (date, time) =>
      t('home.waitMap.openOn', { date: formatLongDate(date), time: formatTime(time) }),
    /** @param {string} time HH:MM */
    pollsOpen: (time) => t('home.waitMap.pollsOpen', { time: formatTime(time) }),
    /** @param {string} open HH:MM @param {string} close HH:MM */
    ended: (open, close) =>
      t('home.waitMap.ended', { open: formatTime(open), close: formatTime(close) }),
    hollow: t('home.waitMap.hollow'),
  },
}));
