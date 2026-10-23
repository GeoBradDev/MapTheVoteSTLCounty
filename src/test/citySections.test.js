// A topic's City of St. Louis section, and any sentence that says "the City",
// rests on a City or state source, never only on a County Board page (#94).
// It repeats cityContent.test.js's checks for blocks that name the City in
// full, and adds the shorter forms, the blocks under a City heading that do
// not name it, and County URLs on www.
// @vitest-environment node
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import election from '../config/election.js';
import referrals from '../config/referrals.js';
import { readTopicFile } from '../features/learn/content/topic.js';

const ROOT = path.resolve(import.meta.dirname, '../..');

/** The County Board's hosts: its pages on the county site and its ArcGIS portal. */
const COUNTY_HOSTS = new Set([
  new URL(election.countySiteUrl).hostname,
  'stlouiscovotes.maps.arcgis.com',
]);
const isCounty = (url) => COUNTY_HOSTS.has(new URL(url).hostname.replace(/^www\./, ''));

/** A heading for a City-only section. */
const CITY_HEADING = /^#{2,4} .*(City of St\. Louis|St\. Louis City)/;

/** Text that names the City, its board or its voters in full. */
const NAMES_CITY = /City of St\. Louis|St\. Louis City|City Board|City voter/;

/** "the City" or "The City's", as the topics shorten the City of St. Louis. */
const SAYS_THE_CITY = /\b[Tt]he City\b/;

/**
 * The paragraphs and list items of a topic body, each with whether it sits in
 * a City section: under a heading naming the City, until the next heading of
 * the same or a higher level.
 * @param {string} body
 * @returns {{ text: string, inCitySection: boolean }[]}
 */
function blocksWithSection(body) {
  const blocks = [];
  let current = null;
  let cityLevel = 0;
  for (const line of body.split('\n')) {
    const heading = /^(#+) /.exec(line);
    if (heading) {
      const level = heading[1].length;
      if (cityLevel && level <= cityLevel) cityLevel = 0;
      if (CITY_HEADING.test(line)) cityLevel = level;
      current = null;
    } else if (!line.trim()) {
      current = null;
    } else if (/^(- |\d+\. )/.test(line) || !current) {
      current = { lines: [line], inCitySection: cityLevel > 0 };
      blocks.push(current);
    } else {
      current.lines.push(line.trim());
    }
  }
  return blocks.map(({ lines, inCitySection }) => ({ text: lines.join(' '), inCitySection }));
}

/**
 * The City blocks of a topic that cite no City or state source.
 * @param {string} text The topic file.
 * @returns {string[]}
 */
function uncitedCityBlocks(text) {
  const { sources } = readTopicFile(text);
  const body = text.replace(/^---\n[\s\S]*?\n---\n/, '');
  const urls = new Map(sources.map((s) => [s.id, s.url]));
  return blocksWithSection(body)
    .filter(
      ({ text: block, inCitySection }) =>
        inCitySection || SAYS_THE_CITY.test(block) || NAMES_CITY.test(block),
    )
    .filter(({ text: block }) => {
      const cited = [...block.matchAll(/\[\^([\w-]+)\]/g)]
        .map((m) => urls.get(m[1]))
        .filter(Boolean);
      return !cited.some((url) => !isCounty(url));
    })
    .map(({ text: block }) => block);
}

/**
 * True when a topic says anything about the City but lists no City Board
 * source.
 * @param {string} text The topic file.
 */
function citySourceMissing(text) {
  const { sources } = readTopicFile(text);
  const body = text.replace(/^---\n[\s\S]*?\n---\n/, '');
  const aboutCity = blocksWithSection(body).some(
    ({ text: block, inCitySection }) =>
      inCitySection || SAYS_THE_CITY.test(block) || NAMES_CITY.test(block),
  );
  return aboutCity && !sources.some((s) => s.url?.startsWith(referrals.stlCityBoard.url));
}

async function topicPaths() {
  const dir = path.join(ROOT, 'content');
  const entries = await readdir(dir, { withFileTypes: true, recursive: true });
  return entries
    .filter((e) => e.isFile() && e.name.endsWith('.md') && e.parentPath.endsWith('learn'))
    .map((e) => path.join(e.parentPath, e.name));
}

const topic = (body) =>
  [
    '---',
    'id: x',
    'sources:',
    '  - id: county',
    '    label: County',
    `    url: ${election.countySiteUrl}`,
    '  - id: state',
    '    label: State',
    '    url: https://revisor.mo.gov/main/OneSection.aspx?section=115.430',
    '---',
    '',
    body,
  ].join('\n');

describe('City sections and "the City" in learn topics (#94)', () => {
  it('checks every block under a City heading, until the next heading at its level', () => {
    const text = topic(
      [
        '## Where',
        '',
        '### City of St. Louis',
        '',
        'Vote at any listed place.[^county]',
        '',
        '- Call us.',
        '',
        '### St. Louis County',
        '',
        'Vote anywhere in the county.[^county]',
        '',
        '## Ask for materials (City of St. Louis)',
        '',
        'Ask two weeks ahead.[^state]',
      ].join('\n'),
    );
    expect(uncitedCityBlocks(text)).toEqual(['Vote at any listed place.[^county]', '- Call us.']);
  });

  it('checks a block that says "the City" outside a City section', () => {
    const text = topic("Any voter in the City can vote at the City's places.[^county]\n\nOk.");
    expect(uncitedCityBlocks(text)).toEqual([
      "Any voter in the City can vote at the City's places.[^county]",
    ]);
  });

  it('checks "The City" at the start of a sentence, and a St. Louis City heading', () => {
    const text = topic(
      ["The City's sites close at 4 p.m.[^county]", '', '#### St. Louis City', '', 'Call us.'].join(
        '\n',
      ),
    );
    expect(uncitedCityBlocks(text)).toEqual([
      "The City's sites close at 4 p.m.[^county]",
      'Call us.',
    ]);
  });

  it('counts a www. County URL as a County source', () => {
    const text = topic('- City voters call us.[^www]').replace(
      '---\n\n',
      '  - id: www\n    label: County\n    url: https://www.stlouiscountymo.gov/x\n---\n\n',
    );
    expect(uncitedCityBlocks(text)).toEqual(['- City voters call us.[^www]']);
  });

  it('fails a topic about the City that lists no City Board source', () => {
    expect(citySourceMissing(topic("The City's sites close early.[^state]"))).toBe(true);
    expect(citySourceMissing(topic('Polls close at 7 p.m.[^state]'))).toBe(false);
  });

  it('holds for every topic under content/', async () => {
    const found = {};
    for (const file of await topicPaths()) {
      const text = await readFile(file, 'utf8');
      const blocks = uncitedCityBlocks(text);
      if (citySourceMissing(text)) blocks.push('lists no City Board source');
      if (blocks.length) found[path.relative(ROOT, file)] = blocks;
    }
    expect(found).toEqual({});
  });
});
