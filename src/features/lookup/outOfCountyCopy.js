// All the out-of-county notice's text, one entry per kind from locate(). The
// text is in src/i18n/en.json (#19). A paragraph is text, optionally followed
// by a link (by its key in the notice's HREFS) and more text.
import { translated } from '../../i18n/index.js';

export const copy = translated((t) => ({
  'stl-city': {
    heading: t('outOfCounty.stlCity.heading'),
    paragraphs: [
      {
        text: t('outOfCounty.stlCity.text'),
        link: { href: 'stlCityBoard', label: t('outOfCounty.stlCity.link') },
        after: t('outOfCounty.stlCity.after'),
      },
    ],
  },
  missouri: {
    heading: t('outOfCounty.missouri.heading'),
    paragraphs: [
      {
        text: t('outOfCounty.missouri.text'),
        link: { href: 'moVoterOutreach', label: t('outOfCounty.missouri.link') },
        after: t('outOfCounty.missouri.after'),
      },
    ],
  },
  'out-of-state': {
    heading: t('outOfCounty.outOfState.heading'),
    paragraphs: [{ text: t('outOfCounty.outOfState.text') }],
  },
  unknown: {
    heading: t('outOfCounty.unknown.heading'),
    paragraphs: [
      {
        text: t('outOfCounty.unknown.text'),
        link: { href: 'moVoterOutreach', label: t('outOfCounty.unknown.link') },
        after: t('outOfCounty.unknown.after'),
      },
      { text: t('outOfCounty.unknown.outsideMissouri') },
    ],
  },
  'county-unmatched': {
    heading: t('outOfCounty.countyUnmatched.heading'),
    paragraphs: [
      {
        text: t('outOfCounty.countyUnmatched.text'),
        link: { href: 'countyLookup', label: t('outOfCounty.countyUnmatched.link') },
        after: t('outOfCounty.countyUnmatched.after'),
      },
    ],
  },
}));
