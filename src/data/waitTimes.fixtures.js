// Minimal wait time fixtures for the client tests (#103): real rows from the
// County and City layers, recorded on 2026-10-22 by #102 and trimmed to the
// fields the client asks for. #102 adds the full recorded responses under
// docs/raw/fixtures/; these may be replaced by them.

/** The County layer at 9:00 a.m. Central, 2026-10-22, newest first. */
export const countyFresh = [
  { Creator: 'abs602boec', CreationDate: 1792677610370, linecount: 0 },
  { Creator: 'abs604boec', CreationDate: 1792677595176, linecount: 2 },
  { Creator: 'abs616boec', CreationDate: 1792677511456, linecount: 0 },
  { Creator: 'abs614boec', CreationDate: 1792677496619, linecount: 0 },
  { Creator: 'abs608boec', CreationDate: 1792677022692, linecount: 0 },
  { Creator: 'abs601boec', CreationDate: 1792676889402, linecount: 0 },
  { Creator: 'abs604boec', CreationDate: 1792676384976, linecount: 2 },
  { Creator: 'abs619boec', CreationDate: 1792676302676, linecount: 0 },
  { Creator: 'abs613boec', CreationDate: 1792676153809, linecount: 1 },
  { Creator: 'abs621boec', CreationDate: 1792675961620, linecount: 8 },
  { Creator: 'abs612boec', CreationDate: 1792675926565, linecount: 2 },
  { Creator: 'abs609boec', CreationDate: 1792675903260, linecount: 0 },
  { Creator: 'abs616boec', CreationDate: 1792675895525, linecount: 0 },
  { Creator: 'abs603boec', CreationDate: 1792675868876, linecount: 1 },
  { Creator: 'abs602boec', CreationDate: 1792675858028, linecount: 0 },
  { Creator: 'abs601boec', CreationDate: 1792675855292, linecount: 2 },
  { Creator: 'abs608boec', CreationDate: 1792675841609, linecount: 0 },
  { Creator: 'abs620boec', CreationDate: 1792675820678, linecount: 0 },
  { Creator: 'abs607boec', CreationDate: 1792675819962, linecount: 0 },
  { Creator: 'abs606boec', CreationDate: 1792675819104, linecount: 0 },
  { Creator: 'abs601boec', CreationDate: 1792675800826, linecount: 1 },
  { Creator: 'abs601boec', CreationDate: 1792675778060, linecount: 2 },
  { Creator: 'abs601boec', CreationDate: 1792675746570, linecount: 2 },
  { Creator: 'abs601boec', CreationDate: 1792675746177, linecount: 4 },
  { Creator: 'abs601boec', CreationDate: 1792675745694, linecount: 3 },
  { Creator: 'abs614boec', CreationDate: 1792675698639, linecount: 0 },
  { Creator: 'abs615boec', CreationDate: 1792675557528, linecount: 3 },
  { Creator: 'abs607boec', CreationDate: 1792675078472, linecount: 0 },
  { Creator: 'abs615boec', CreationDate: 1792674938064, linecount: 0 },
  { Creator: 'abs611boec', CreationDate: 1792674727499, linecount: 2 },
  { Creator: 'abs612boec', CreationDate: 1792674723991, linecount: 0 },
  { Creator: 'abs605boec', CreationDate: 1792674596933, linecount: 3 },
  { Creator: 'abs616boec', CreationDate: 1792674578426, linecount: 0 },
  { Creator: 'abs605boec', CreationDate: 1792674260512, linecount: 18 },
  { Creator: 'abs619boec', CreationDate: 1792674183716, linecount: 7 },
  { Creator: 'abs609boec', CreationDate: 1792674173297, linecount: 29 },
  { Creator: 'abs604boec', CreationDate: 1792674148952, linecount: 16 },
  { Creator: 'abs602boec', CreationDate: 1792674086476, linecount: 2 },
  { Creator: 'abs617boec', CreationDate: 1792674064717, linecount: 1 },
  { Creator: 'abs621boec', CreationDate: 1792674045128, linecount: 6 },
  { Creator: 'abs614boec', CreationDate: 1792674035887, linecount: 1 },
  { Creator: 'abs620boec', CreationDate: 1792674030215, linecount: 0 },
  { Creator: 'abs608boec', CreationDate: 1792673954824, linecount: 6 },
];

/** The City layer at 9:00 a.m. Central, 2026-10-22: the Board office reported at 8:10 a.m. */
export const cityFresh = [
  {
    facilityid: 'Buder_Library',
    earlyvotingoperhours:
      'Mo (13:00-16:00); Tu (11:00-17:00); W-Th (11:00-19:00); Fr-Sa (11:00-16:30); Su (Closed))',
    comments: null,
    waittime: 0,
    created_date_1740505041182: 1792625575903,
  },
  {
    facilityid: 'Carpenter_Library',
    earlyvotingoperhours: 'Mo (13:00-16:00); Tu-Th (11:00-17:00); Fr-Sa (11:00-16:30);Su (Closed))',
    comments: null,
    waittime: 4,
    created_date_1740505041182: 1792618241585,
  },
  {
    facilityid: 'Kingshighway_Branch_Library',
    earlyvotingoperhours: 'Mo (13:00-16:00); Tu-Th (11:00-17:00); Fr-Sa (11:00-16:30);Su (Closed))',
    comments: null,
    waittime: 0,
    created_date_1740505041182: 1792618194291,
  },
  {
    facilityid: 'Schlafly_Library',
    earlyvotingoperhours:
      'Mo (13:00-16:00); Tu (11:00-17:00); W-Th (11:00-19:00); Fr-Sa (11:00-16:30); Su (Closed))',
    comments: null,
    waittime: 3,
    created_date_1740505041182: 1792625457624,
  },
  {
    facilityid: 'Walnut_Park_Library',
    earlyvotingoperhours: 'Mo (13:00-16:00); Tu-Th (11:00-17:00); Fr-Sa (11:00-16:30);Su (Closed))',
    comments: null,
    waittime: 0,
    created_date_1740505041182: 1792620013031,
  },
  {
    facilityid: 'St._Louis_City_Election_Board',
    earlyvotingoperhours: 'Mo-Fr (08:00-17:00)',
    comments: null,
    waittime: 0,
    created_date_1740505041182: 1792674645407,
  },
  {
    facilityid: 'Julia_Davis',
    earlyvotingoperhours:
      'Mo (13:00-16:00); Tu (11:00-17:00); W-Th (11:00-19:00); Fr-Sa (11:00-16:30); Su (Closed))',
    comments: null,
    waittime: 0,
    created_date_1740505041182: 1792625322039,
  },
  {
    facilityid: 'St._Joan_of_Arc',
    earlyvotingoperhours:
      'Mo (13:00-16:00); Tu (11:00-17:00); W-Th (11:00-19:00); Fr-Sa (11:00-16:30); Su (Closed))',
    comments: 'New early voting site! Opens Tuesday, October 27!',
    waittime: null,
    created_date_1740505041182: null,
  },
];

/** The City layer at 7:44 a.m. Central, 2026-10-22: every report is from 2026-10-21. */
export const cityStale = [
  {
    facilityid: 'Buder_Library',
    earlyvotingoperhours:
      'Mo (13:00-16:00); Tu (11:00-17:00); W-Th (11:00-19:00); Fr-Sa (11:00-16:30); Su (Closed))',
    comments: null,
    waittime: 0,
    created_date_1740505041182: 1792625575903,
  },
  {
    facilityid: 'Carpenter_Library',
    earlyvotingoperhours: 'Mo (13:00-16:00); Tu-Th (11:00-17:00); Fr-Sa (11:00-16:30);Su (Closed))',
    comments: null,
    waittime: 4,
    created_date_1740505041182: 1792618241585,
  },
  {
    facilityid: 'Kingshighway_Branch_Library',
    earlyvotingoperhours: 'Mo (13:00-16:00); Tu-Th (11:00-17:00); Fr-Sa (11:00-16:30);Su (Closed))',
    comments: null,
    waittime: 0,
    created_date_1740505041182: 1792618194291,
  },
  {
    facilityid: 'Schlafly_Library',
    earlyvotingoperhours:
      'Mo (13:00-16:00); Tu (11:00-17:00); W-Th (11:00-19:00); Fr-Sa (11:00-16:30); Su (Closed))',
    comments: null,
    waittime: 3,
    created_date_1740505041182: 1792625457624,
  },
  {
    facilityid: 'Walnut_Park_Library',
    earlyvotingoperhours: 'Mo (13:00-16:00); Tu-Th (11:00-17:00); Fr-Sa (11:00-16:30);Su (Closed))',
    comments: null,
    waittime: 0,
    created_date_1740505041182: 1792620013031,
  },
  {
    facilityid: 'St._Louis_City_Election_Board',
    earlyvotingoperhours: 'Mo-Fr (08:00-17:00)',
    comments: null,
    waittime: 0,
    created_date_1740505041182: 1792617567063,
  },
  {
    facilityid: 'Julia_Davis',
    earlyvotingoperhours:
      'Mo (13:00-16:00); Tu (11:00-17:00); W-Th (11:00-19:00); Fr-Sa (11:00-16:30); Su (Closed))',
    comments: null,
    waittime: 0,
    created_date_1740505041182: 1792625322039,
  },
  {
    facilityid: 'St._Joan_of_Arc',
    earlyvotingoperhours:
      'Mo (13:00-16:00); Tu (11:00-17:00); W-Th (11:00-19:00); Fr-Sa (11:00-16:30); Su (Closed))',
    comments: 'New early voting site! Opens Tuesday, October 27!',
    waittime: null,
    created_date_1740505041182: null,
  },
];
