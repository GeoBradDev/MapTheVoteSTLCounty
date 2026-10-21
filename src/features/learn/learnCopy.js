// Labels around a voter education topic, by locale. The topic text itself is
// in content/<locale>/learn/. A Spanish entry (#19) goes next to `en` with the
// same keys; TopicArticle falls back to English for a locale with no entry.

export const learnCopy = {
  en: {
    sourcesHeading: 'Sources',
    /** @param {number} n @param {string} label */
    citationLabel: (n, label) => `Source ${n}: ${label}`,
    /** @param {string} date Already formatted for the locale. */
    lastVerified: (date) => `Last checked against these sources on ${date}.`,
  },
};
