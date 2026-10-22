// Labels for the "How to vote" pages (#23) and around a voter education topic,
// by locale. The topic text itself is
// in content/<locale>/learn/. A Spanish entry (#19) goes next to `en` with the
// same keys; TopicArticle falls back to English for a locale with no entry.

export const learnCopy = {
  en: {
    pageHeading: 'How to vote',
    /** @param {string} name The page's own name, such as a topic title. */
    pageTitle: (name) => `${name} | St. Louis County Voter Guide`,
    intro: 'Short guides to voting in St. Louis County, each checked against official sources.',
    // Headings of the topic groups, keyed like TOPIC_GROUPS in groups.js.
    groups: {
      'before-you-vote': 'Before you vote',
      'ways-to-vote': 'Ways to vote',
      'at-the-polls': 'At the polls',
      'get-help': 'Get help',
    },
    // Until the first topic is published (#22). Says nothing about how to
    // vote itself: only where the official information is.
    empty: {
      notReady:
        'Our voting guides are not ready yet. For official information on how to vote, see the',
      countySite: 'St. Louis County Board of Elections website',
    },
    moreHelp: 'More help',
    lookup: 'Look up your precinct, nearby polling places, sample ballot and districts',
    countySite: 'St. Louis County Board of Elections website',
    allTopics: 'All voting guides',
    sourcesHeading: 'Sources',
    /** @param {number} n @param {string} label */
    citationLabel: (n, label) => `Source ${n}: ${label}`,
    /** @param {string} date Already formatted for the locale. */
    lastVerified: (date) => `Last checked against these sources on ${date}.`,
  },
};
