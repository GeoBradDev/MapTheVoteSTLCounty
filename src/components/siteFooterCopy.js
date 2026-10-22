// The footer's words (#71). The text is in src/i18n/en.json (#19). The
// statement names both official sources (City parity, #85 and #93) and no one
// else: it makes no claim about who runs the site. The links' addresses come
// from the config.
import { translated } from '../i18n/index.js';

export const copy = translated((t) => ({
  statement: t('footer.statement'),
  officialSites: t('footer.officialSites'),
  countySite: t('footer.countySite'),
  citySite: t('footer.citySite'),
  privacy: t('footer.privacy'),
}));
