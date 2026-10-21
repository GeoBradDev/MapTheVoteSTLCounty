// Vite plugin that turns each voter education topic file,
// content/<locale>/learn/<id>.md, into a JSON module at build time (#21).
// topics.js loads them with import.meta.glob, so the browser gets plain data:
// no YAML or Markdown parser ships, and the topics work offline and can be
// pre-rendered. A topic that fails any check in topic.js fails the dev server,
// the tests and the build, naming the file and every problem.
//
// Every topic file is checked when the build (or dev server) starts, whether
// or not app code imports it yet, so a bad topic can never wait in content/
// for the page that will show it.

import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import election from '../../../config/election.js';
import { parseTopic } from './topic.js';

const TOPIC_FILE = /\/content\/[^/]+\/learn\/[^/]+\.md$/;

/** Every content/<locale>/learn/*.md file under `root`, as absolute paths. */
async function topicFiles(root) {
  const contentDir = path.join(root, 'content');
  let locales;
  try {
    locales = await readdir(contentDir, { withFileTypes: true });
  } catch (error) {
    if (error.code === 'ENOENT') return [];
    throw error;
  }
  const files = [];
  for (const locale of locales.filter((e) => e.isDirectory())) {
    const learnDir = path.join(contentDir, locale.name, 'learn');
    let entries = [];
    try {
      entries = await readdir(learnDir, { withFileTypes: true });
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
    }
    for (const entry of entries) {
      if (entry.name.endsWith('.md')) files.push(path.join(learnDir, entry.name));
    }
  }
  return files.sort();
}

/**
 * @param {{ electionDate?: string }} [options] `electionDate` defaults to the
 *   election config's; tests pass their own.
 * @returns {import('vite').Plugin}
 */
export default function learnContent({ electionDate = election.electionDate } = {}) {
  // Vite always calls configResolved first; '.' is the project root then.
  let root = '.';
  return {
    name: 'mapthevote-learn-content',
    enforce: 'pre',
    configResolved(config) {
      root = config.root;
    },
    async buildStart() {
      const problems = [];
      for (const file of await topicFiles(root)) {
        try {
          parseTopic(await readFile(file, 'utf8'), { file, electionDate });
        } catch (error) {
          problems.push(error.message);
        }
      }
      if (problems.length) this.error(problems.join('\n'));
    },
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
