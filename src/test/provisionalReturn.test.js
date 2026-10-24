// A provisional ballot cast without a photo ID counts if the voter comes back
// with one to the polling place where it was cast: RSMo 115.427.4(1)(a) says
// "returns to the polling place", and the envelope certificate in 115.427.3
// reads "I return to this polling place today" (#154). A County or City voter
// may vote at any of their board's polling places (#152, #94), so "your polling
// place" could read as some other place; the topics say "the same" one.
// @vitest-environment node
import { readFile } from 'node:fs/promises';
import path from 'node:path';

const LEARN = path.resolve(import.meta.dirname, '../../content/en/learn');
const topic = (id) => readFile(path.join(LEARN, `${id}.md`), 'utf8');

/** The topic text with its line breaks folded, so a phrase can span lines. */
const flat = async (id) => (await topic(id)).replace(/\s+/g, ' ');

describe.each(['provisional-ballots', 'voter-id'])('%s', (id) => {
  it('sends the voter back to the same polling place where they voted, citing RSMo 115.427', async () => {
    const text = await flat(id);
    expect(text).toMatch(
      /back to the same polling place where you voted[^.]*by 7 p\.m\.[^.]*\.\[\^rsmo-115-427\]/,
    );
  });

  it('no longer says "your polling place" for the return', async () => {
    expect(await flat(id)).not.toMatch(/back to your polling place/);
  });
});

describe('moved-or-changed-name', () => {
  it('does not imply one assigned polling place for a name change', async () => {
    const text = await flat('moved-or-changed-name');
    expect(text).not.toMatch(/election judges at your polling place/);
    expect(text).toMatch(/election judges at the polling place where you vote/);
  });
});
