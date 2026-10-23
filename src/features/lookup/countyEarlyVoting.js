// The County's early voting schedules, a site's own schedule and its key in the
// County's line counts, shared by the early voting card and the summary at the
// top of the results (#81).
import election from '../../config/election.js';

export const countySchedules = election.earlyVoting.schedules;

/** @param {{ absType: string | null }} site */
export const countySchedule = (site) => countySchedules[site.absType];

/** @param {{ waitKey: string | null }} site */
export const countyWaitKey = (site) => site.waitKey;
