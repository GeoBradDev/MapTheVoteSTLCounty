import { parseMarkdown } from './markdown.js';

const text = (value) => ({ type: 'text', value });

describe('parseMarkdown', () => {
  it('parses paragraphs, joining wrapped lines with a space', () => {
    const { blocks, errors } = parseMarkdown('First line\nsecond line.\n\nNext paragraph.');
    expect(errors).toEqual([]);
    expect(blocks).toEqual([
      { type: 'paragraph', children: [text('First line second line.')] },
      { type: 'paragraph', children: [text('Next paragraph.')] },
    ]);
  });

  it('parses level 2 and 3 headings', () => {
    const { blocks, errors } = parseMarkdown('## Before you go\n\n### At the polls');
    expect(errors).toEqual([]);
    expect(blocks).toEqual([
      { type: 'heading', level: 2, children: [text('Before you go')] },
      { type: 'heading', level: 3, children: [text('At the polls')] },
    ]);
  });

  it('parses unordered and ordered lists with continuation lines', () => {
    const md = '- One\n- Two wraps\n  onto a second line\n\n1. First\n2. Second';
    const { blocks, errors } = parseMarkdown(md);
    expect(errors).toEqual([]);
    expect(blocks).toEqual([
      {
        type: 'list',
        ordered: false,
        items: [[text('One')], [text('Two wraps onto a second line')]],
      },
      { type: 'list', ordered: true, items: [[text('First')], [text('Second')]] },
    ]);
  });

  it('parses bold, links and citations inline', () => {
    const md = 'Bring **a photo ID** or see [the county](https://example.gov/a).[^sos-id]';
    const { blocks, errors, citations } = parseMarkdown(md);
    expect(errors).toEqual([]);
    expect(blocks[0].children).toEqual([
      text('Bring '),
      { type: 'strong', children: [text('a photo ID')] },
      text(' or see '),
      { type: 'link', href: 'https://example.gov/a', children: [text('the county')] },
      text('.'),
      { type: 'cite', source: 'sos-id' },
    ]);
    expect(citations).toEqual(['sos-id']);
  });

  it('lists every link it found so the caller can check them', () => {
    const { links } = parseMarkdown('[a](https://a.gov/) and **[b](/learn)**');
    expect(links).toEqual(['https://a.gov/', '/learn']);
  });

  it.each([
    ['a level 1 heading', '# Title'],
    ['a level 4 heading', '#### Deep'],
    ['raw HTML', 'Hello <b>there</b>'],
    ['an HTML comment', '<!-- note -->'],
    ['an image', '![map](https://a.gov/m.png)'],
    ['a code fence', '```\ncode\n```'],
    ['inline code', 'Use `this`'],
    ['a blockquote', '> quoted'],
    ['a table', '| a | b |'],
    ['a nested list', '- One\n  - Nested'],
    ['an unmatched bold marker', 'Bold **without end'],
    ['single-star emphasis', 'Some *emphasis* here'],
    ['a footnote definition', '[^sos-id]: Secretary of State'],
    ['a link with no URL', '[text]()'],
    ['a bare bracket', 'See [this] page'],
    ['a heading with no text', '## '],
    ['a horizontal rule', '---'],
    ['an underlined heading', 'Title\n==='],
    ['an ordered list that does not start at 1', '3. Third\n4. Fourth'],
    ['an ordered list that skips a number', '1. One\n3. Three'],
    ['ordered items split by blank lines', '1. Register\n\n2. Request a ballot'],
    ['a link URL with a parenthesis', 'See [page](https://a.gov/a_(b)) now.'],
    ['a blockquote inside a list item', '- item\n  > quoted'],
    ['a heading inside a list item', '- item\n  ## head'],
    ['a 1) list marker', '1) First step'],
    ['an empty list item', '-'],
    ['an empty ordered item', '1.'],
    ['a nested list on an item first line', '- - nested'],
    ['a heading in an item first line', '- ## heading'],
    ['a quote in an item first line', '1. > quote'],
    ['a two-dash underlined heading', 'Heading\n--'],
    ['a spaced horizontal rule', '- - -'],
    ['a spaced underscore rule', '_ _ _'],
    ['a tab after a list marker', '-\titem'],
    ['a tab after an ordered marker', '1.\titem'],
    ['a text direction override in body text', 'Call \u202E1234'],
    ['a zero width space in a link label', '[\u200B](https://a.gov/)'],
  ])('rejects %s', (_name, md) => {
    expect(parseMarkdown(md).errors.length).toBeGreaterThan(0);
  });

  it('reports the line number of a problem', () => {
    const { errors } = parseMarkdown('Fine.\n\n# Title');
    expect(errors).toEqual([expect.stringMatching(/^line 3: /)]);
  });

  it('reports every problem in a paragraph, not just the first', () => {
    const { errors } = parseMarkdown('<b>x</b> then `code` and ![img](https://a.gov/i.png)');
    expect(errors.join('\n')).toMatch(/raw HTML/);
    expect(errors.join('\n')).toMatch(/code/);
    expect(errors.join('\n')).toMatch(/images/);
  });

  it('rejects an empty body', () => {
    expect(parseMarkdown('  \n\n').errors).toEqual(['the topic has no body text']);
  });
});
