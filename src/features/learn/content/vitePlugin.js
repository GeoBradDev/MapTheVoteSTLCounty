// Vite plugin that turns each voter education topic file,
// content/<locale>/learn/<id>.md, into a JSON module at build time (#21).
// topics.js loads them with import.meta.glob, so the browser gets plain data:
// no YAML or Markdown parser ships, and the topics work offline and can be
// pre-rendered. A topic that fails any check in topic.js fails the dev server,
// the tests and the build, naming the file and every problem.

import election from '../../../config/election.js';
import { parseTopic } from './topic.js';

const TOPIC_FILE = /\/content\/[^/]+\/learn\/[^/]+\.md$/;

/**
 * @param {{ electionDate?: string }} [options] `electionDate` defaults to the
 *   election config's; tests pass their own.
 * @returns {import('vite').Plugin}
 */
export default function learnContent({ electionDate = election.electionDate } = {}) {
  return {
    name: 'mapthevote-learn-content',
    enforce: 'pre',
    transform(code, id) {
      // A query (?raw, ?url) means Vite or another plugin owns this import.
      if (id.includes('?')) return null;
      const file = id.replaceAll('\\', '/');
      if (!TOPIC_FILE.test(file)) return null;
      let topic;
      try {
        topic = parseTopic(code, { file, electionDate });
      } catch (error) {
        this.error(error.message);
      }
      return { code: `export default ${JSON.stringify(topic)};\n`, map: null };
    },
  };
}
