// The build's server render (#99), in Node: no window, document or navigator,
// as at build time.
// @vitest-environment node
import { getTopics } from './features/learn/topics.js';
import { prerenderPaths } from './pageHead.js';
import { prepare, render, renderRoute } from './entry-server.jsx';

const TEMPLATE =
  '<html><head><meta name="description" content="x"><title>x</title></head>' +
  '<body><div id="root"></div></body></html>';

// The topic bodies load on demand in the browser (#147); the build loads them all first.
beforeAll(() => prepare());

describe('server render', () => {
  it('runs with no browser globals', () => {
    expect(typeof window).toBe('undefined');
    expect(typeof document).toBe('undefined');
  });

  it.each(prerenderPaths())('renders %s with its heading, skip link and footer', (route) => {
    const html = render(route);
    expect(html.match(/<h1\b/g)).toHaveLength(1);
    expect(html).toContain('href="#main"');
    expect(html).toContain('<footer');
  });

  it('renders a topic with its own heading and text', () => {
    const topic = getTopics().find((t) => t.id === 'voter-id');
    const html = render('/learn/voter-id');
    expect(html).toContain(topic.title);
    expect(html).toContain('In Missouri, you must show a photo ID');
  });

  it('renders the home page with the address search', () => {
    expect(render('/')).toContain('role="combobox"');
  });

  it('writes a whole page: head tags and the marked root', () => {
    const page = renderRoute('/privacy', TEMPLATE);
    expect(page).toContain('<link rel="canonical" href="https://mapthevotestl.com/privacy">');
    expect(page).toMatch(/<div id="root" data-prerendered="\/privacy"><div [^>]*><a href="#main"/);
  });

  it('refuses a path that has no pre-rendered page', () => {
    expect(() => renderRoute('/p/CC007', TEMPLATE)).toThrow(/\/p\/CC007/);
  });
});
