// The voter education topics (#21), loaded at build time. Each file at
// content/<locale>/learn/<id>.md arrives here as plain data, already checked by
// the Vite plugin in content/vitePlugin.js; see the README's "Learn content".
//
// The first load carries only each topic's summary (id, locale, title, group
// and intro, content/topic.js), which /learn, the result cards' links and the
// page heads read. A topic's body (its text and sources) is a chunk of its own,
// loaded with its page (#147): loadTopic() fetches it, loadedTopic() returns it
// once fetched. The build loads every body before it pre-renders (#99), and
// src/main.jsx loads a pre-rendered topic's body before hydrating it.
//
// Locales (#19): English (`en`) is the default and the full set. A topic
// translated into another locale is a file with the same id under that locale's
// folder; until then that locale shows the English topic.

/** The locale every topic must exist in, and the fallback for the others. */
export const DEFAULT_LOCALE = 'en';

/** @typedef {import('./content/topic.js').Topic} Topic */
/** @typedef {import('./content/topic.js').TopicSummary} TopicSummary */
/** @typedef {() => Promise<Topic>} BodyLoader */

const bodyKey = (topic) => `${topic.locale}/${topic.id}`;
const BODY_PATH = /\/content\/([^/]+)\/learn\/([^/]+)\.md$/;

/**
 * Keys body loaders by locale and id.
 * @param {Record<string, BodyLoader>} modules import.meta.glob output (lazy).
 * @returns {Map<string, BodyLoader>}
 */
export function indexBodies(modules) {
  const index = new Map();
  for (const [file, load] of Object.entries(modules)) {
    const [, locale, id] = BODY_PATH.exec(file);
    index.set(bodyKey({ locale, id }), load);
  }
  return index;
}

/**
 * Indexes topic summaries by locale and id.
 * @param {Record<string, TopicSummary | Topic>} modules import.meta.glob output.
 * @returns {Map<string, Map<string, TopicSummary | Topic>>}
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
 * @param {Map<string, Map<string, TopicSummary | Topic>>} index
 * @param {Map<string, BodyLoader>} [bodies] From indexBodies.
 */
export function topicLookups(index, bodies = new Map()) {
  /** @type {Map<string, Topic>} */
  const loaded = new Map();
  /** @type {Map<string, Promise<Topic>>} */
  const pending = new Map();
  /**
   * The whole topic once its body is loaded, else null. A topic that carries
   * its body (blocks) already is loaded.
   * @param {TopicSummary | Topic} topic From getTopic or getTopics.
   * @returns {Topic | null}
   */
  const loadedTopic = (topic) => ('blocks' in topic ? topic : (loaded.get(bodyKey(topic)) ?? null));
  /**
   * Loads a topic's body, once; a failed load is tried again on the next call.
   * @param {TopicSummary | Topic} topic
   * @returns {Promise<Topic>}
   */
  const loadTopic = (topic) => {
    const done = loadedTopic(topic);
    if (done) return Promise.resolve(done);
    const key = bodyKey(topic);
    if (!pending.has(key)) {
      const load = bodies.get(key);
      const request = (load ? load() : Promise.reject(new Error(`No body for topic ${key}`))).then(
        (body) => {
          loaded.set(key, body);
          pending.delete(key);
          return body;
        },
        (error) => {
          pending.delete(key);
          throw error;
        },
      );
      pending.set(key, request);
    }
    return pending.get(key);
  };
  const forLocale = (locale) => index.get(locale) ?? new Map();
  /**
   * One topic's summary, in `locale` if translated, else English, else null.
   * @param {string} id
   * @param {string} [locale]
   * @returns {TopicSummary | null}
   */
  const getTopic = (id, locale = DEFAULT_LOCALE) =>
    forLocale(locale).get(id) ?? forLocale(DEFAULT_LOCALE).get(id) ?? null;
  return {
    /**
     * Every topic's summary in `locale`, falling back to English per topic,
     * by title.
     * @param {string} [locale]
     * @returns {TopicSummary[]}
     */
    getTopics(locale = DEFAULT_LOCALE) {
      const ids = new Set([...forLocale(DEFAULT_LOCALE).keys(), ...forLocale(locale).keys()]);
      return [...ids].map((id) => getTopic(id, locale)).sort(byTitle);
    },
    getTopic,
    loadedTopic,
    loadTopic,
    /** Every body, for the build's pre-render. */
    loadAllTopics: () =>
      Promise.all(
        [...index.values()].flatMap((byId) => [...byId.values()].map((topic) => loadTopic(topic))),
      ),
  };
}

export const { getTopics, getTopic, loadedTopic, loadTopic, loadAllTopics } = topicLookups(
  indexTopics(
    import.meta.glob('/content/*/learn/*.md', { eager: true, import: 'default', query: '?meta' }),
  ),
  indexBodies(import.meta.glob('/content/*/learn/*.md', { import: 'default' })),
);
