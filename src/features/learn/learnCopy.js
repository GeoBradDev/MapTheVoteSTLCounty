// Labels for the "How to vote" pages (#23) and around a voter education topic.
// The text is in src/i18n/<locale>.json (#19); the topic text itself is in
// content/<locale>/learn/. `copy` is in the site's current language.
// `learnCopy[locale]` is in one language, for a topic shown in its own
// language: undefined for a locale whose messages are not loaded, so a caller
// falls back to English.
import { isLoaded, tFor, translated } from '../../i18n/index.js';

/** @param {ReturnType<typeof tFor>} t */
const build = (t) => ({
  pageHeading: t('learn.pageHeading'),
  /** @param {string} name The page's own name, such as a topic title. */
  pageTitle: (name) => t('learn.pageTitle', { name }),
  intro: t('learn.intro'),
  // Headings of the topic groups, keyed like TOPIC_GROUPS in groups.js.
  groups: {
    'before-you-vote': t('learn.groups.before-you-vote'),
    'ways-to-vote': t('learn.groups.ways-to-vote'),
    'at-the-polls': t('learn.groups.at-the-polls'),
    'get-help': t('learn.groups.get-help'),
  },
  // Until the first topic is published (#22). Says nothing about how to
  // vote itself: only where the official information is.
  empty: {
    notReady: t('learn.empty.notReady'),
    countySite: t('learn.empty.countySite'),
    or: t('learn.empty.or'),
    citySite: t('learn.empty.citySite'),
  },
  moreHelp: t('learn.moreHelp'),
  lookup: t('learn.lookup'),
  countySite: t('learn.countySite'),
  citySite: t('learn.citySite'),
  allTopics: t('learn.allTopics'),
  sourcesHeading: t('learn.sourcesHeading'),
  /** @param {number} n @param {string} label */
  citationLabel: (n, label) => t('learn.citationLabel', { n, label }),
  /** @param {string} date Already formatted for the locale. */
  lastVerified: (date) => t('learn.lastVerified', { date }),
});

export const copy = translated(build);

const byLocale = new Map();

/** @type {Record<string, ReturnType<typeof build> | undefined>} */
export const learnCopy = new Proxy(
  {},
  {
    get: (_, locale) => {
      if (typeof locale !== 'string' || !isLoaded(locale)) return undefined;
      if (!byLocale.has(locale)) byLocale.set(locale, build(tFor(locale)));
      return byLocale.get(locale);
    },
  },
);
