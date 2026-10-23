// The words of the app's last-resort error screen (#18). The text is in
// src/i18n/en.json (#19).
import { translated } from '../i18n/index.js';

export const copy = translated((t) => ({
  heading: t('errorBoundary.heading'),
  body: t('errorBoundary.body'),
  officialLookup: t('errorBoundary.officialLookup'),
  // On a City precinct's page (#89): the results page's own link text.
  officialLookupCity: t('results.officialLookupCity'),
  reload: t('errorBoundary.reload'),
  home: t('errorBoundary.home'),
}));
