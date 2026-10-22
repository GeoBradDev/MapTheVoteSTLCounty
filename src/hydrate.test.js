// Whether the browser hydrates the root (#99) or renders it fresh.
import { endHydration, focusHeadingOnArrival, shouldHydrate, startHydration } from './hydrate.js';

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

describe('focusHeadingOnArrival', () => {
  let heading;
  let button;

  beforeEach(() => {
    document.body.innerHTML = '<button>Earlier</button><h1 tabindex="-1">Page</h1>';
    heading = document.querySelector('h1');
    button = document.querySelector('button');
    vi.stubGlobal('scrollY', 0);
  });

  afterEach(() => {
    endHydration();
    vi.unstubAllGlobals();
  });

  it('focuses the heading on an in-app arrival', () => {
    button.focus();
    focusHeadingOnArrival(heading);
    expect(heading).toHaveFocus();
  });

  it('focuses the heading on a hydrated load the voter has not touched', () => {
    startHydration();
    focusHeadingOnArrival(heading);
    expect(heading).toHaveFocus();
  });

  it('leaves focus where the voter tabbed before hydration', () => {
    startHydration();
    button.focus();
    focusHeadingOnArrival(heading);
    expect(button).toHaveFocus();
  });

  it('leaves the page where the voter scrolled before hydration', () => {
    startHydration();
    vi.stubGlobal('scrollY', 400);
    focusHeadingOnArrival(heading);
    expect(heading).not.toHaveFocus();
  });

  it('focuses as usual again once the voter moves to another page', () => {
    startHydration();
    endHydration();
    button.focus();
    focusHeadingOnArrival(heading);
    expect(heading).toHaveFocus();
  });
});
