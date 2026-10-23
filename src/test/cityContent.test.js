// A learn topic serves City and County voters alike (#94). A sentence about the
// City of St. Louis must rest on a source that covers the City: the City
// Board's own pages, or a state source. A County Board page, or no citation at
// all, is not enough (#154).
// @vitest-environment node
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { readTopicFile } from '../features/learn/content/topic.js';

const ROOT = path.resolve(import.meta.dirname, '../..');

/** The City Board's pages, on the City's own site. */
const CITY_BOARD =
  'https://www.stlouis-mo.gov/government/departments/board-election-commissioners/';

/** The County Board's hosts: its pages on the county site and its ArcGIS portal. */
const COUNTY_HOSTS = ['stlouiscountymo.gov', 'stlouiscovotes.maps.arcgis.com'];

/** Text that names the City, its board or its voters. */
const NAMES_CITY = /City of St\. Louis|St\. Louis City|City Board|City voter/;

/**
 * The paragraphs and list items of a topic body, each as one string. Headings
 * are left out: they cannot cite a source.
 * @param {string} body
 * @returns {string[]}
 */
function bodyBlocks(body) {
  const blocks = [];
  let current = null;
  for (const line of body.split('\n')) {
    if (!line.trim()) {
      current = null;
    } else if (line.startsWith('#')) {
      current = null;
    } else if (/^(- |\d+\. )/.test(line)) {
      current = [line];
      blocks.push(current);
    } else if (current) {
      current.push(line.trim());
    } else {
      current = [line];
      blocks.push(current);
    }
  }
  return blocks.map((lines) => lines.join(' '));
}

/** The source ids a block cites. */
const citations = (block) => [...block.matchAll(/\[\^([\w-]+)\]/g)].map((m) => m[1]);

const isCounty = (url) => COUNTY_HOSTS.includes(new URL(url).hostname);

/**
 * Problems with a topic's City sentences, as readable strings.
 * @param {string} text The topic file.
 * @returns {string[]}
 */
function cityProblems(text) {
  const { sources } = readTopicFile(text);
  const body = text.replace(/^---\n[\s\S]*?\n---\n/, '');
  const urls = new Map(sources.map((s) => [s.id, s.url]));
  const problems = [];
  const cityBlocks = bodyBlocks(body).filter((block) => NAMES_CITY.test(block));
  if (cityBlocks.length && ![...urls.values()].some((url) => url.startsWith(CITY_BOARD))) {
    problems.push('names the City but lists no City Board source');
  }
  for (const block of cityBlocks) {
    const cited = citations(block)
      .map((id) => urls.get(id))
      .filter(Boolean);
    if (!cited.some((url) => !isCounty(url))) {
      problems.push(`names the City with no City or state source: "${block.slice(0, 80)}"`);
    }
  }
  return problems;
}

async function topicPaths() {
  const dir = path.join(ROOT, 'content');
  const entries = await readdir(dir, { withFileTypes: true, recursive: true });
  return entries
    .filter((e) => e.isFile() && e.name.endsWith('.md') && e.parentPath.endsWith('learn'))
    .map((e) => path.join(e.parentPath, e.name));
}

const topic = (sources, body) =>
  [
    '---',
    'id: x',
    'sources:',
    ...sources.flatMap(([id, url]) => [`  - id: ${id}`, `    label: ${id}`, `    url: ${url}`]),
    '---',
    '',
    body,
  ].join('\n');

const CITY_URL = `${CITY_BOARD}voter/polling-places/index.cfm`;
const COUNTY_URL = 'https://stlouiscountymo.gov/st-louis-county-government/board-of-elections/';
const STATE_URL = 'https://revisor.mo.gov/main/OneSection.aspx?section=115.430';

describe('City sentences in learn topics (#94)', () => {
  it('splits a body into paragraphs and list items, without headings', () => {
    expect(
      bodyBlocks('Intro\nmore.\n\n## Head\n\n- One\n  two.\n- Three\n\n1. Four\n\nLast.'),
    ).toEqual(['Intro more.', '- One two.', '- Three', '1. Four', 'Last.']);
  });

  it('passes a City sentence that cites the City Board or the state', () => {
    const text = topic(
      [
        ['city', CITY_URL],
        ['state', STATE_URL],
      ],
      'In the City of St. Louis, vote anywhere.[^city]\n\nCity voters follow the law.[^state]',
    );
    expect(cityProblems(text)).toEqual([]);
  });

  it('fails a City sentence with no citation, or only a County one', () => {
    const text = topic(
      [
        ['city', CITY_URL],
        ['county', COUNTY_URL],
      ],
      'This does not apply in the City of St. Louis.\n\n- City voters call us.[^county]',
    );
    expect(cityProblems(text)).toEqual([
      'names the City with no City or state source: "This does not apply in the City of St. Louis."',
      'names the City with no City or state source: "- City voters call us.[^county]"',
    ]);
  });

  it('fails a topic that names the City but lists no City Board source', () => {
    const text = topic([['state', STATE_URL]], 'City voters follow the law.[^state]');
    expect(cityProblems(text)).toEqual(['names the City but lists no City Board source']);
  });

  it('holds for every topic under content/', async () => {
    const found = {};
    for (const file of await topicPaths()) {
      const problems = cityProblems(await readFile(file, 'utf8'));
      if (problems.length) found[path.relative(ROOT, file)] = problems;
    }
    expect(found).toEqual({});
  });
});
