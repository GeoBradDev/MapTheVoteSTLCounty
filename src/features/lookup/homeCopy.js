// All the home page text. The text is in src/i18n/en.json (#19). Election
// names and dates come from src/config/election.js, never from here.
import { formatCalendarDate, translated } from '../../i18n/index.js';

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
}));
