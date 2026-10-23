// The site header's words (#79). The text is in src/i18n/en.json (#19); the
// site name is the one the pages' titles use.
import { translated } from '../i18n/index.js';

export const copy = translated((t) => ({
  siteName: t('site.name'),
  nav: t('header.nav'),
  lookUp: t('header.lookUp'),
  howToVote: t('header.howToVote'),
}));
