// Whether the browser hydrates the root (#99) or renders it fresh.
import { shouldHydrate } from './hydrate.js';

function root(path, html = '<div><h1>Page</h1></div>') {
  const element = document.createElement('div');
  element.id = 'root';
  if (path !== undefined) element.dataset.prerendered = path;
  element.innerHTML = html;
  return element;
}

describe('shouldHydrate', () => {
  it.each([
    ['/learn', '/learn'],
    ['/learn', '/learn/'],
    ['/', '/'],
    ['/learn/voter-id', '/learn/voter-id/'],
  ])('hydrates markup rendered for %s at %s', (rendered, pathname) => {
    expect(shouldHydrate(root(rendered), pathname)).toBe(true);
  });

  it.each([
    ['/', '/index.html'],
    ['/learn', '/learn/voter-id'],
    ['/privacy', '/p/CC007'],
  ])('renders fresh when markup for %s is served at %s', (rendered, pathname) => {
    expect(shouldHydrate(root(rendered), pathname)).toBe(false);
  });

  it('renders fresh into the empty shell', () => {
    expect(shouldHydrate(root(undefined, ''), '/p/CC007')).toBe(false);
  });

  it('renders fresh when the marked root is empty', () => {
    expect(shouldHydrate(root('/learn', ''), '/learn')).toBe(false);
  });
});
