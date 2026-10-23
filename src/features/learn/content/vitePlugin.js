// Vite plugin that turns each voter education topic file,
// content/<locale>/learn/<id>.md, into a JSON module at build time (#21).
// topics.js loads them with import.meta.glob, so the browser gets plain data
// and no YAML or Markdown parser ships, and the topics can be pre-rendered:
// each topic's summary (`?meta`) in the first load, and its whole text in a
// chunk of its own that loads with its page (#147). A topic that fails any
// check in topic.js fails the dev server, the tests and the build, naming the
// file and every problem.
//
// Every topic file is checked when the build (or dev server) starts, whether
// or not app code imports it yet, so a bad topic can never wait in content/
// for the page that will show it.

import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import election from '../../../config/election.js';
import { parseTopic, topicSummary } from './topic.js';

const TOPIC_FILE = /\/content\/[^/]+\/learn\/[^/]+\.md$/;

/** Every content/<locale>/learn/*.md file under `root`, as absolute paths. */
export async function topicFiles(root) {
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
      if (entry.isFile() && entry.name.endsWith('.md')) files.push(path.join(learnDir, entry.name));
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
      // `?meta` asks for the topic's summary (#147): what the first load
      // carries. The dev server adds a `t` timestamp to either import after an
      // edit. Any other query (?raw, ?url) means Vite or another plugin owns
      // this import.
      const [path, query] = id.split('?');
      const params = new URLSearchParams(query ?? '');
      if (![...params.keys()].every((key) => key === 'meta' || key === 't')) return null;
      const summary = params.has('meta');
      const file = path.replaceAll('\\', '/');
      if (!TOPIC_FILE.test(file)) return null;
      let topic;
      try {
        topic = parseTopic(code, { file, electionDate });
      } catch (error) {
        this.error(error.message);
      }
      const data = summary ? topicSummary(topic) : topic;
      return { code: `export default ${JSON.stringify(data)};\n`, map: null };
    },
  };
}
