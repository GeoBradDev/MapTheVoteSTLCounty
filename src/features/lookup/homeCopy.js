// All the home page text. The text is in src/i18n/en.json (#19). Election
// names and dates come from src/config/election.js, never from here.
import { formatCalendarDate, translated } from '../../i18n/index.js';

export const copy = translated((t) => ({
  heading: t('home.heading'),
  intro: t('home.intro'),
  // Says up front that this is not the county's own site (#71); the footer
  // names the official boards.
  unofficial: t('home.unofficial'),
  /** @param {string} isoDate YYYY-MM-DD @param {string} timeZone */
  electionDay: (isoDate, timeZone) => {
    const formatted = formatCalendarDate(isoDate, {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      timeZone,
    });
    return t('home.electionDay', { date: formatted });
  },
  moreInfo: t('home.moreInfo'),
  howToVote: t('home.howToVote'),
  countySite: t('home.countySite'),
}));
