// The voter education topics (#21), loaded at build time. Each file at
// content/<locale>/learn/<id>.md arrives here as plain data, already checked by
// the Vite plugin in content/vitePlugin.js; see the README's "Learn content".
//
// Locales (#19): English (`en`) is the default and the full set. A topic
// translated into another locale is a file with the same id under that locale's
// folder; until then that locale shows the English topic.

/** The locale every topic must exist in, and the fallback for the others. */
export const DEFAULT_LOCALE = 'en';

/** @typedef {import('./content/topic.js').Topic} Topic */

/**
 * Indexes topic modules by locale and id.
 * @param {Record<string, Topic>} modules import.meta.glob output.
 * @returns {Map<string, Map<string, Topic>>}
 */
export function indexTopics(modules) {
  const index = new Map();
  for (const topic of Object.values(modules)) {
    if (!index.has(topic.locale)) index.set(topic.locale, new Map());
    index.get(topic.locale).set(topic.id, topic);
  }
  return index;
}

const byTitle = (a, b) => a.title.localeCompare(b.title, a.locale);

/**
 * Builds the lookups over an index.
 * @param {Map<string, Map<string, Topic>>} index
 */
export function topicLookups(index) {
  const forLocale = (locale) => index.get(locale) ?? new Map();
  return {
    /**
     * Every topic in `locale`, falling back to English per topic, by title.
     * @param {string} [locale]
     * @returns {Topic[]}
     */
    getTopics(locale = DEFAULT_LOCALE) {
      const ids = new Set([...forLocale(DEFAULT_LOCALE).keys(), ...forLocale(locale).keys()]);
      return [...ids].map((id) => this.getTopic(id, locale)).sort(byTitle);
    },
    /**
     * One topic, in `locale` if translated, else English, else null.
     * @param {string} id
     * @param {string} [locale]
     * @returns {Topic | null}
     */
    getTopic(id, locale = DEFAULT_LOCALE) {
      return forLocale(locale).get(id) ?? forLocale(DEFAULT_LOCALE).get(id) ?? null;
    },
  };
}

export const { getTopics, getTopic } = topicLookups(
  indexTopics(import.meta.glob('/content/*/learn/*.md', { eager: true, import: 'default' })),
);
