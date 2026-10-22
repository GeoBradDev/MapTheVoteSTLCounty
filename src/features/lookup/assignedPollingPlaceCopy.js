// The Election Day polling place rule's text, shared by the home page and the
// polling places card. The text is in src/i18n/en.json (#19). St. Louis County
// only: the City of St. Louis has its own board and its own rule (#89). Wording
// follows RSMo 115.430 and the Secretary of State, like the provisional ballots
// topic (#22).
import { translated } from '../../i18n/index.js';

export const copy = translated((t) => ({
  // The central polling place sentence keeps the Secretary of State's own hedge.
  rule: t('assignedPollingPlace.rule'),
  central: t('assignedPollingPlace.central'),
  // Then the phone number as a link.
  confirm: t('assignedPollingPlace.confirm'),
  // Then the Secretary of State's lookup as a link. "May" is the state's own word.
  stateLookup: t('assignedPollingPlace.stateLookup'),
  mayAlso: t('assignedPollingPlace.mayAlso'),
  sources: t('assignedPollingPlace.sources'),
  // Link text for each source, by its host. Distinct from the hours' "Missouri
  // law" link, which cites another section.
  sourceNames: {
    'revisor.mo.gov': t('assignedPollingPlace.sourceNames.missouriLaw'),
    'www.sos.mo.gov': t('assignedPollingPlace.sourceNames.secretaryOfState'),
    // The county's Polling Place Lookup app, which lists the board's number.
    'stlouiscovotes.maps.arcgis.com': t('assignedPollingPlace.sourceNames.countyLookup'),
  },
}));
