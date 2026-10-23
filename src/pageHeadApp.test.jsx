// The head follows the page on in-app navigation (#99). A pre-rendered page
// arrives with its own title, description, canonical and Open Graph tags; once
// the voter moves on, the head must describe the new page, and a page with no
// entry (a precinct, the not-found page) gets the shell's head back.
import { act, render, screen, waitFor } from '@testing-library/react';
import { Router } from 'wouter';
import { memoryLocation } from 'wouter/memory-location';
import App from './App.jsx';
import { siteUrl } from './config/site.js';
import { copy as errorCopy } from './components/errorBoundaryCopy.js';
import { copy as waitCopy } from './features/waitTimes/waitTimesCopy.js';
import { pageHead, shellHead } from './pageHead.js';

// The privacy page throws when `privacyThrows` is set, to show the error screen.
let privacyThrows = false;
vi.mock('./features/privacy/PrivacyPage.jsx', async (importOriginal) => {
  const { default: PrivacyPage } = await importOriginal();
  return {
    default: function MaybeBroken() {
      if (privacyThrows) throw new Error('broken');
      return <PrivacyPage />;
    },
  };
});

beforeEach(() => {
  vi.stubGlobal(
    'fetch',
    vi.fn(() => new Promise(() => {})),
  );
  vi.stubGlobal('scrollTo', vi.fn());
});

afterEach(() => {
  vi.unstubAllGlobals();
  privacyThrows = false;
});

// The head as the pre-rendered file for `route` sends it.
function arriveAt(route) {
  const head = pageHead(route);
  document.title = head.title;
  document.head.innerHTML = `<title>${head.title}</title><meta name="description" content="${head.description}"><link rel="canonical" href="${head.canonical}">`;
  const location = memoryLocation({ path: route, record: true });
  render(
    <Router hook={location.hook}>
      <App />
    </Router>,
  );
  return location;
}

const canonical = () => document.head.querySelector('link[rel="canonical"]')?.href ?? null;
const description = () => document.head.querySelector('meta[name="description"]')?.content;
const ogUrl = () => document.head.querySelector('meta[property="og:url"]')?.content ?? null;

describe('head on navigation', () => {
  it('keeps the pre-rendered head on arrival', () => {
    arriveAt('/learn/voter-id');
    expect(document.title).toBe(pageHead('/learn/voter-id').title);
    expect(canonical()).toBe(`${siteUrl}/learn/voter-id`);
    expect(ogUrl()).toBe(`${siteUrl}/learn/voter-id`);
  });

  it('describes each public page it moves to, and the shell on other pages', () => {
    const location = arriveAt('/learn/voter-id');

    act(() => location.navigate('/privacy'));
    expect(document.title).toBe(pageHead('/privacy').title);
    expect(description()).toBe(pageHead('/privacy').description);
    expect(canonical()).toBe(`${siteUrl}/privacy`);

    act(() => location.navigate('/'));
    expect(document.title).toBe(shellHead().title);
    expect(canonical()).toBe(`${siteUrl}/`);

    act(() => location.navigate('/p/CC007'));
    expect(document.title).toBe('Precinct CC007 | St. Louis Voter Guide');
    expect(description()).toBe(shellHead().description);
    expect(canonical()).toBeNull();
    expect(ogUrl()).toBeNull();

    act(() => location.navigate('/nope'));
    expect(document.title).toBe('Page not found | St. Louis Voter Guide');
    expect(canonical()).toBeNull();
  });

  // The title chain each page restores starts from the pre-rendered title, so
  // the home page, which sets none of its own, must still get the site's.
  it('gives the home page the site title after a pre-rendered topic', () => {
    const location = arriveAt('/learn/voter-id');
    act(() => location.navigate('/privacy'));
    act(() => location.navigate('/'));
    expect(document.title).toBe('St. Louis Voter Guide');
  });

  // Every page puts back the title it found when it goes. That must happen
  // before the next page sets its own, or the old title wins (#128).
  describe.each(['/privacy', '/learn', '/learn/voter-id'])('straight from %s', (from) => {
    it.each([
      ['/p/CC007', 'Precinct CC007 | St. Louis Voter Guide'],
      ['/p/W01P12', 'Precinct W01P12 | St. Louis Voter Guide'],
    ])('gives %s its own title', (to, title) => {
      const location = arriveAt(from);
      act(() => location.navigate(to));
      expect(document.title).toBe(title);
    });
  });

  it.each(['/early-voting', '/nope'])('gives a precinct its own title straight from %s', (from) => {
    const location = arriveAt('/');
    act(() => location.navigate(from));
    act(() => location.navigate('/p/CC007'));
    expect(document.title).toBe('Precinct CC007 | St. Louis Voter Guide');
  });

  // The topic body and the wait times page load on demand, so these wait for
  // the page to be shown (and its title set) before moving on (#128).
  it('gives a precinct its own title straight from a loaded topic', async () => {
    const location = arriveAt('/privacy');
    act(() => location.navigate('/learn/voter-id'));
    await screen.findByRole('heading', { level: 1, name: 'What ID to bring' });
    act(() => location.navigate('/p/W01P12'));
    expect(document.title).toBe('Precinct W01P12 | St. Louis Voter Guide');
  });

  it('gives a precinct its own title straight from the loaded wait times page', async () => {
    const location = arriveAt('/privacy');
    act(() => location.navigate('/early-voting'));
    await waitFor(() => {
      expect(document.title).toMatch(
        new RegExp(`^(${waitCopy.heading}|${waitCopy.electionDay.heading}) \\|`),
      );
    });
    act(() => location.navigate('/p/CC007'));
    expect(document.title).toBe('Precinct CC007 | St. Louis Voter Guide');
  });

  it('gives a public page its own title straight from a precinct', () => {
    const location = arriveAt('/privacy');
    act(() => location.navigate('/p/W01P12'));
    act(() => location.navigate('/learn'));
    expect(document.title).toBe(pageHead('/learn').title);
    act(() => location.navigate('/p/CC007'));
    act(() => location.navigate('/'));
    expect(document.title).toBe('St. Louis Voter Guide');
  });

  it('never puts a query string or hash in the canonical', () => {
    const location = arriveAt('/learn');
    act(() => location.navigate('/privacy?address=1318+Ross+Ave#main'));
    expect(canonical()).toBe(`${siteUrl}/privacy`);
    expect(document.head.innerHTML).not.toMatch(/Ross|address=/);
  });

  // The error screen (#18) is not the page that failed: it keeps its own
  // title and the shell's head, never the failed page's canonical.
  it('gives the error screen on a public path its own title and the shell head', () => {
    const errors = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      const location = arriveAt('/learn');
      privacyThrows = true;
      act(() => location.navigate('/privacy'));
      expect(document.querySelector('h1')).toHaveTextContent(errorCopy.heading);
      expect(document.title).toBe(`${errorCopy.heading} | St. Louis Voter Guide`);
      expect(canonical()).toBeNull();
      expect(ogUrl()).toBeNull();
      expect(description()).toBe(shellHead().description);
    } finally {
      errors.mockRestore();
    }
  });
});
