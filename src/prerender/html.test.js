// @vitest-environment node
import { renderPage } from './html.js';

const TEMPLATE = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta
      name="description"
      content="The shell description."
    />
    <title>Shell title</title>
    <meta property="og:type" content="website" />
    <meta property="og:title" content="Shell title" />
    <meta
      property="og:description"
      content="The shell description."
    />
    <meta property="og:image" content="https://mapthevotestl.com/share-image.png" />
    <meta name="twitter:card" content="summary_large_image" />
    <script type="module" crossorigin src="/assets/index-abc.js"></script>
  </head>
  <body>
    <div id="root"></div>
  </body>
</html>
`;

const HEAD = {
  title: 'Voter ID & you | Guide',
  description: 'Bring a "photo" ID <now>.',
  canonical: 'https://mapthevotestl.com/learn/voter-id',
};

describe('renderPage', () => {
  const page = () =>
    renderPage(TEMPLATE, { path: '/learn/voter-id', head: HEAD, html: '<h1>What ID</h1>' });

  it('puts the markup in the root, marked with the path it was rendered for', () => {
    expect(page()).toContain(
      '<div id="root" data-prerendered="/learn/voter-id"><h1>What ID</h1></div>',
    );
  });

  it('replaces the title, escaped', () => {
    expect(page()).toContain('<title>Voter ID &amp; you | Guide</title>');
    expect(page()).not.toContain('Shell title');
  });

  it('replaces the description and adds the canonical and Open Graph tags, escaped', () => {
    const html = page();
    expect(html).not.toContain('The shell description.');
    expect(html.match(/name="description"/g)).toHaveLength(1);
    expect(html).toContain(
      '<meta name="description" content="Bring a &quot;photo&quot; ID &lt;now&gt;.">',
    );
    expect(html).toContain(
      '<link rel="canonical" href="https://mapthevotestl.com/learn/voter-id">',
    );
    expect(html).toContain('<meta property="og:title" content="Voter ID &amp; you | Guide">');
    expect(html).toContain(
      '<meta property="og:url" content="https://mapthevotestl.com/learn/voter-id">',
    );
  });

  // The template's own Open Graph and card tags are the shell's (#98): the
  // page writes its own instead, so each tag is there once.
  it("drops the template's Open Graph and card tags for the page's own", () => {
    const html = page();
    expect(html).not.toContain('content="Shell title"');
    for (const tag of [
      'property="og:type"',
      'property="og:title"',
      'property="og:description"',
      'property="og:image"',
      'name="twitter:card"',
    ]) {
      expect(html.split(tag), tag).toHaveLength(2);
    }
  });

  it('keeps everything else in the template', () => {
    expect(page()).toContain('<script type="module" crossorigin src="/assets/index-abc.js">');
    expect(page()).toContain('<meta charset="UTF-8" />');
  });

  it.each([
    ['title', TEMPLATE.replace(/<title>.*<\/title>/, '')],
    ['description', TEMPLATE.replace(/<meta\s+name="description"[^>]*>/, '')],
    ['root', TEMPLATE.replace('<div id="root"></div>', '<div id="app"></div>')],
  ])('fails loudly when the template has no %s to replace', (_, template) => {
    expect(() => renderPage(template, { path: '/', head: HEAD, html: '' })).toThrow(/pre-render/);
  });
});
