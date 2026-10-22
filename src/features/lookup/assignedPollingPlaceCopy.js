// The Election Day polling place rule's text, shared by the home page and the
// polling places card. Kept in one file so the i18n work (#19) can move it to
// en.json without touching the markup. St. Louis County only: the City of St.
// Louis has its own board and its own rule (#89). Wording follows RSMo 115.430
// and the Secretary of State, like the provisional ballots topic (#22).
export const copy = {
  // The central polling place sentence keeps the Secretary of State's own hedge.
  rule: 'In St. Louis County, on Election Day you must vote at your assigned polling place. A provisional ballot cast at the wrong polling place is not counted.',
  central:
    'If there is a problem at your assigned polling place, you may be able to vote at a central polling place instead.',
  // Then the phone number as a link.
  confirm:
    'To confirm your assigned polling place, call the St. Louis County Board of Elections at',
  // Then the Secretary of State's lookup as a link. "May" is the state's own word.
  stateLookup: 'Missouri Secretary of State Voter Outreach Center',
  mayAlso: 'You may also be able to find it with the',
  sources: 'Sources:',
  // Link text for each source, by its host. Distinct from the hours' "Missouri
  // law" link, which cites another section.
  sourceNames: {
    'revisor.mo.gov': 'Missouri law (section 115.430)',
    'www.sos.mo.gov': 'Missouri Secretary of State',
    'stlouiscovotes.info': 'St. Louis County Board of Elections contact page',
  },
};
