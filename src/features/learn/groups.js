// The groups of the "How to vote" page (#23), in the order the page lists them.
// Each topic names one in its front matter (`group:`); the build fails on any
// other value. Their labels are under `learn.groups` in src/i18n/en.json.
// Shared by the build-time checks and the page, so it imports nothing.

export const TOPIC_GROUPS = Object.freeze([
  'before-you-vote',
  'ways-to-vote',
  'at-the-polls',
  'get-help',
]);
