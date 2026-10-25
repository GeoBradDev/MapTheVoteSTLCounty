// "A polling place your election board's rule above allows, or a central
// polling place" rewords RSMo 115.430's "the correct polling place or a central
// polling place". It is cited to the statute alone: the Secretary of State's
// Other Voting Questions page blocks scripts and was not re-read for the new
// wording (owner decision on #199).
// @vitest-environment node
import { readFile } from 'node:fs/promises';
import path from 'node:path';

const FILE = path.resolve(import.meta.dirname, '../../content/en/learn/provisional-ballots.md');

it('cites RSMo 115.430 alone for where a voter at the wrong polling place can go', async () => {
  const text = (await readFile(FILE, 'utf8')).replace(/\s+/g, ' ');
  expect(text).toMatch(
    /a polling place your election board's rule above allows, or a central polling place\.\[\^rsmo-115-430\](?!\[)/,
  );
});
