// The County's Election Day polling place rule's text, for the County polling
// places card (the home page states no rule, #165). The text is in
// src/i18n/en.json (#19). St. Louis County only: the City of St. Louis has its
// own board and its own rule (#89).
// Owner decision on #152, reversing #72: a registered County voter may vote at
// any polling place in the County, as the County Board's Polling Places page
// says.
import { translated } from '../../i18n/index.js';

export const copy = translated((t) => ({
  rule: t('countyElectionDayRule.rule'),
  cityNote: t('countyElectionDayRule.cityNote'),
  // Then the phone number as a link.
  help: t('countyElectionDayRule.help'),
  sources: t('countyElectionDayRule.sources'),
  // Link text for each source, by its host.
  sourceNames: {
    'stlouiscountymo.gov': t('countyElectionDayRule.sourceNames.countyBoard'),
    // The county's Polling Place Lookup app, which lists the board's number.
    'stlouiscovotes.maps.arcgis.com': t('countyElectionDayRule.sourceNames.countyLookup'),
  },
}));
