// A County voter may vote at any polling place in St. Louis County on Election
// Day (#152), and a City voter at any of the City's listed polling places
// (#94), so the learn topics must not read as if a voter has one assigned
// polling place (#199). RSMo 115.430 still decides a provisional ballot cast
// at the wrong polling place: one not "established for the voter", which each
// board's rule names. RSMo 115.436.3 still lets a voter with a physical
// disability ask for an accessible polling place. The County Board's Polling
// Places page is cited only for the words the topics already attribute to it.
// @vitest-environment node
import { readFile } from 'node:fs/promises';
import path from 'node:path';

const LEARN = path.resolve(import.meta.dirname, '../../content/en/learn');

/** The topic text with its line breaks folded, so a phrase can span lines. */
const flat = async (id) =>
  (await readFile(path.join(LEARN, `${id}.md`), 'utf8')).replace(/\s+/g, ' ');

/** The text from a heading to the next heading of any level. */
const section = (text, heading) => {
  const start = text.indexOf(heading);
  if (start < 0) return '';
  const rest = text.slice(start + heading.length);
  const end = rest.search(/ #{2,3} /);
  return end < 0 ? rest : rest.slice(0, end);
};

const COUNTY_RULE =
  /A registered voter may vote at any polling place in St\. Louis County on Election Day\.\[\^county-polling-places\]/;

describe('provisional-ballots, at the wrong polling place', () => {
  it('no longer says "your correct polling place"', async () => {
    expect(await flat('provisional-ballots')).not.toMatch(/your correct polling place/);
  });

  it('says which rule covers which voters, citing each board', async () => {
    const text = section(await flat('provisional-ballots'), '### At the wrong polling place');
    expect(text).toMatch(
      /County rule above is for St\. Louis County voters,\[\^county-polling-places\]/,
    );
    expect(text).toMatch(
      /City rule is for voters registered at a City address\.\[\^city-polling-places\]/,
    );
  });

  it('keeps RSMo 115.430 for the wrong polling place and where to go', async () => {
    const text = section(await flat('provisional-ballots'), '### At the wrong polling place');
    expect(text).toMatch(/wrong polling place is not counted\.\[\^rsmo-115-430\]/);
    expect(text).toMatch(
      /a polling place your election board's rule above allows, or a central polling place\.\[\^rsmo-115-430\]/,
    );
  });

  it('attributes to the County page only the rule the topic already gives it', async () => {
    const text = await flat('provisional-ballots');
    expect(text).toMatch(COUNTY_RULE);
  });
});

describe('accessible-voting, St. Louis County', () => {
  it('no longer says "ask the county board for a different one"', async () => {
    expect(await flat('accessible-voting')).not.toMatch(/for a different one/);
  });

  it('states the County rule with the same words and source as the provisional ballots topic', async () => {
    const text = section(await flat('accessible-voting'), '### St. Louis County');
    expect(text).toMatch(COUNTY_RULE);
  });

  it('keeps the RSMo 115.436 request for an accessible polling place', async () => {
    const text = section(await flat('accessible-voting'), '### St. Louis County');
    expect(text).toMatch(
      /ask the county board for a polling place that is accessible to you\.\[\^sos-how-to-vote\]\[\^rsmo-115-436\]/,
    );
  });

  it('lists the County Polling Places source with the same label and URL as the provisional ballots topic', async () => {
    const source = (text) =>
      text.match(/- id: county-polling-places label: ([^\n]+?) url: (\S+)/)?.slice(1);
    const accessible = source(await flat('accessible-voting'));
    expect(accessible).toBeDefined();
    expect(accessible).toEqual(source(await flat('provisional-ballots')));
  });
});
