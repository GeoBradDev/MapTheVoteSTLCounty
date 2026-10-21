// Fixtures are live responses recorded by scripts/record-fixtures.mjs.
// @vitest-environment node
import nonresidential from '../../docs/raw/fixtures/precinct-nonresidential.json';
import byId from '../../docs/raw/fixtures/precinct-by-id.json';
import { parseSampleBallot } from './sampleBallot.js';

// The recorded CC007 link, so no election-specific URL is written here.
const URL_OK = byId.features[0].attributes.html.match(/href=(\S+?)>/)[1];
const ITEM = URL_OK.match(/[0-9a-f]{32}/)[0];
const HOST = new URL(URL_OK).host;

const link = (href, text = 'CC-007.pdf') => `Sample Ballot: <a href=${href}>${text}</a>`;

describe('parseSampleBallot', () => {
  it('reads the link from the recorded CC007 precinct', () => {
    expect(parseSampleBallot(byId.features[0].attributes.html)).toEqual({
      url: URL_OK,
      fileName: 'CC-007.pdf',
    });
  });

  it.each([
    ['unquoted', URL_OK],
    ['single-quoted', `'${URL_OK}'`],
    ['double-quoted', `"${URL_OK}"`],
  ])('accepts a %s href', (_, href) => {
    expect(parseSampleBallot(link(href))).toEqual({ url: URL_OK, fileName: 'CC-007.pdf' });
  });

  it('accepts HREF in any case and spaces around the equals sign', () => {
    const html = `<A HREF = "${URL_OK}" target="_blank">CC-007.pdf</A>`;
    expect(parseSampleBallot(html)).toEqual({ url: URL_OK, fileName: 'CC-007.pdf' });
  });

  it('takes the file name from the link text, without tags or padding', () => {
    expect(parseSampleBallot(link(URL_OK, '  <b>CC-007.pdf</b> '))).toEqual({
      url: URL_OK,
      fileName: 'CC-007.pdf',
    });
  });

  it('gives a null file name when the link text is empty', () => {
    expect(parseSampleBallot(link(URL_OK, ''))).toEqual({ url: URL_OK, fileName: null });
  });

  it('returns the nonresidential message from the recorded AP200 precinct verbatim', () => {
    const html = nonresidential.features[0].attributes.html;
    expect(html).toMatch(/no recognized residential addresses/);
    expect(parseSampleBallot(html)).toEqual({ message: html });
  });

  it('returns plain text without tags, with whitespace collapsed', () => {
    expect(parseSampleBallot('  No ballot<br>for this   precinct.\n')).toEqual({
      message: 'No ballot for this precinct.',
    });
  });

  it.each([
    ['empty', ''],
    ['whitespace', '   \n '],
    ['null', null],
    ['undefined', undefined],
    ['a number', 42],
    ['an object', { href: URL_OK }],
    ['only tags', '<br><br>'],
  ])('returns a null message for %s', (_, html) => {
    expect(parseSampleBallot(html)).toEqual({ message: null });
  });

  it.each([
    ['a non-portal URL', 'https://example.com/ballot.pdf'],
    ['a javascript: URL', 'javascript:alert(1)'],
    ['a quoted javascript: URL', `"javascript:alert('${URL_OK}')"`],
    ['a data: URL', 'data:text/html,hi'],
    ['an http: URL', URL_OK.replace('https:', 'http:')],
    ['a lookalike host', URL_OK.replace(HOST, `${HOST}.example.com`)],
    ['a URL with a query', `${URL_OK}?x=1`],
    ['a URL with a fragment', `${URL_OK}#x`],
    ['a URL with an extra path', `${URL_OK}/more`],
    ['a short item ID', URL_OK.replace(ITEM, ITEM.slice(1))],
    ['an uppercase item ID', URL_OK.replace(ITEM, ITEM.toUpperCase())],
    ['a protocol-relative URL', URL_OK.replace('https:', '')],
    ['an encoded URL', URL_OK.replace('/data', '/%64ata')],
    ['an empty href', '""'],
  ])('rejects %s and shows nothing', (_, href) => {
    expect(parseSampleBallot(link(href))).toEqual({ message: null });
  });

  it('never returns the markup of a rejected link as a message', () => {
    const result = parseSampleBallot(`<a href="javascript:alert(1)">Click</a>`);
    expect(result).toEqual({ message: null });
  });

  it('reads a link even when the href comes after other attributes', () => {
    expect(parseSampleBallot(`<a class="x" href='${URL_OK}'>CC-007.pdf</a>`)).toEqual({
      url: URL_OK,
      fileName: 'CC-007.pdf',
    });
  });

  it('reads an href after a slash, which browsers treat as an attribute separator', () => {
    expect(parseSampleBallot(`<a/href=${URL_OK}>CC-007.pdf</a>`)).toEqual({
      url: URL_OK,
      fileName: 'CC-007.pdf',
    });
    expect(parseSampleBallot('<a/href=javascript:alert(1)>Click me</a>')).toEqual({
      message: null,
    });
  });

  it('ignores href= written in the text, outside any tag', () => {
    expect(parseSampleBallot('Polls closed; see href=below for info')).toEqual({
      message: 'Polls closed; see href=below for info',
    });
  });

  it('ignores an href in a comment or in a tag other than a link', () => {
    const html = `<!-- old <a href=x>y</a> --><span href="x"></span><a href="${URL_OK}">CC-007.pdf</a>`;
    expect(parseSampleBallot(html)).toEqual({ url: URL_OK, fileName: 'CC-007.pdf' });
  });

  it('ignores an href inside another attribute value', () => {
    const html = `<a title="see href=x" href="${URL_OK}">CC-007.pdf</a>`;
    expect(parseSampleBallot(html)).toEqual({ url: URL_OK, fileName: 'CC-007.pdf' });
  });

  it('takes the file name after the whole opening tag, even with > in a quoted value', () => {
    const html = `<a href="${URL_OK}" title="a>b">CC-007.pdf</a>`;
    expect(parseSampleBallot(html)).toEqual({ url: URL_OK, fileName: 'CC-007.pdf' });
  });

  it('shows nothing for an unfinished link tag rather than its markup', () => {
    expect(parseSampleBallot('Sample Ballot: <a href=javascript:alert(1)')).toEqual({
      message: null,
    });
  });

  it('keeps < and > that are not part of a tag', () => {
    expect(parseSampleBallot('Ages < 18 and > 0')).toEqual({ message: 'Ages < 18 and > 0' });
  });

  it('returns a new object each time', () => {
    const result = parseSampleBallot('');
    result.extra = true;
    expect(parseSampleBallot('')).toEqual({ message: null });
  });

  it('skips a finished link with no href and keeps the text', () => {
    expect(parseSampleBallot('<a name="top"></a>No ballot for this precinct.')).toEqual({
      message: 'No ballot for this precinct.',
    });
  });

  it('removes tags with a > in a quoted value, in messages and file names', () => {
    expect(parseSampleBallot('<span title="a>b">No ballot here</span>')).toEqual({
      message: 'No ballot here',
    });
    expect(parseSampleBallot(`<a href=${URL_OK}><b title="x>y">CC-007.pdf</b></a>`)).toEqual({
      url: URL_OK,
      fileName: 'CC-007.pdf',
    });
  });

  it.each([
    ['a declaration', 'msg <!DOCTYPE html>No ballot'],
    ['CDATA', '<![CDATA[x]]>No ballot'],
    ['a processing instruction', '<?xml version="1.0"?>No ballot'],
    ['a script', '<script>alert(1)</script>No ballot'],
    ['a style', '<style>p{}</style>No ballot'],
    ['an image', 'No ballot <img src=x onerror=alert(1)>'],
    ['a textarea around a link', `<textarea><a href=${URL_OK}>CC</a></textarea>`],
    ['an unfinished tag', 'Hello <img src=x onerror=alert(1)'],
    ['an unfinished closing tag', '<p>Msg</p'],
    ['an unclosed comment', 'Msg <!-- note'],
    ['a < inside a tag', 'No ballot <span title=x <br>'],
    ['a link inside another tag', `<p <a href=${URL_OK}>CC</a>`],
    ['a quote in an attribute name', `<a b"=" href=${URL_OK}>CC</a>`],
    ['an unfinished tag in the link text', `<a href=${URL_OK}>CC.pdf<img src=x`],
  ])('shows nothing for markup it does not know: %s', (_, html) => {
    expect(parseSampleBallot(html)).toEqual({ message: null });
  });

  it('ignores a link written inside an attribute value', () => {
    const html = `<span title="<a href=${URL_OK}>x</a>">Real message</span>`;
    expect(parseSampleBallot(html)).toEqual({ message: 'Real message' });
  });

  it('drops comments and inline tags from text without adding spaces', () => {
    expect(parseSampleBallot(`<a href=${URL_OK}>CC<!-- x -->-<b>007</b>.pdf</a>`)).toEqual({
      url: URL_OK,
      fileName: 'CC-007.pdf',
    });
    expect(parseSampleBallot('No ballot.<br>Call us.<p>Thanks</p>')).toEqual({
      message: 'No ballot. Call us. Thanks',
    });
  });

  it('shows nothing for a comment a browser would end early at --!>', () => {
    const html = `<!-- x --!><span title="--> <a href=${URL_OK}>CC</a>">No ballot</span>`;
    expect(parseSampleBallot(html)).toEqual({ message: null });
  });

  it('treats <!--> as an empty comment', () => {
    expect(parseSampleBallot(`<!--><a href=${URL_OK}>CC-007.pdf</a>`)).toEqual({
      url: URL_OK,
      fileName: 'CC-007.pdf',
    });
  });

  it('ends the file name at a closing tag with attributes or at the next link', () => {
    expect(parseSampleBallot(`<a href=${URL_OK}>CC-007.pdf</a foo>trailing`)).toEqual({
      url: URL_OK,
      fileName: 'CC-007.pdf',
    });
    expect(parseSampleBallot(`<a href=${URL_OK}>CC-007.pdf<a href=x>other</a>`)).toEqual({
      url: URL_OK,
      fileName: 'CC-007.pdf',
    });
  });

  it('shows nothing when an earlier link tag cannot be read', () => {
    const html = `<a title=x"y href=javascript:alert(1)>Click</a> <a href="${URL_OK}">CC</a>`;
    expect(parseSampleBallot(html)).toEqual({ message: null });
  });

  it('does not treat a no-break space as an attribute separator', () => {
    expect(parseSampleBallot(`<a\u00a0href=${URL_OK}>CC-007.pdf</a>`)).toEqual({
      message: null,
    });
  });

  it('stays fast on a long field of unfinished tags', () => {
    const started = performance.now();
    parseSampleBallot('<a "'.repeat(20000));
    parseSampleBallot('<a '.repeat(20000));
    expect(performance.now() - started).toBeLessThan(200);
  });

  it('does not mistake an attribute ending in href for the href', () => {
    const html = `<a data-href="${URL_OK}" href="https://example.com/x">CC-007.pdf</a>`;
    expect(parseSampleBallot(html)).toEqual({ message: null });
  });
});
