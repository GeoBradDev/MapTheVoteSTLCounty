import { render, screen, within } from '@testing-library/react';
import { Router } from 'wouter';
import { memoryLocation } from 'wouter/memory-location';
import { copy } from './siteHeaderCopy.js';
import SiteHeader from './SiteHeader.jsx';

function renderAt(path) {
  const { hook } = memoryLocation({ path });
  return render(
    <Router hook={hook}>
      <SiteHeader />
    </Router>,
  );
}

const nav = () => screen.getByRole('navigation', { name: copy.nav });

describe('SiteHeader (#79)', () => {
  it('is the banner landmark, with the site name linking home', () => {
    renderAt('/learn');
    const banner = screen.getByRole('banner');
    const home = within(banner).getByRole('link', { name: 'St. Louis Voter Guide' });
    expect(home).toHaveAttribute('href', '/');
  });

  it('draws its mark in currentColor and hides it from screen readers', () => {
    const { container } = renderAt('/');
    const svg = container.querySelector('header svg');
    expect(svg).toHaveAttribute('aria-hidden', 'true');
    for (const el of svg.querySelectorAll('*')) {
      for (const attr of ['fill', 'stroke']) {
        const value = el.getAttribute(attr);
        if (value !== null) expect(['none', 'currentColor']).toContain(value);
      }
    }
  });

  it('has a labeled nav with Look up and How to vote', () => {
    renderAt('/learn');
    const links = within(nav()).getAllByRole('link');
    expect(links.map((a) => [a.textContent, a.getAttribute('href')])).toEqual([
      [copy.lookUp, '/'],
      [copy.howToVote, '/learn'],
    ]);
    expect(copy.lookUp).toBe('Look up');
    expect(copy.howToVote).toBe('How to vote');
  });

  it.each([
    ['/', 'Look up'],
    ['/learn', 'How to vote'],
  ])('marks the current page on %s', (path, current) => {
    renderAt(path);
    const links = within(nav()).getAllByRole('link');
    for (const link of links) {
      if (link.textContent === current) expect(link).toHaveAttribute('aria-current', 'page');
      else expect(link).not.toHaveAttribute('aria-current');
    }
  });

  it.each(['/p/CC007', '/privacy', '/learn/voter-id', '/early-voting', '/nope'])(
    'marks no link current on %s',
    (path) => {
      renderAt(path);
      for (const link of within(nav()).getAllByRole('link')) {
        expect(link).not.toHaveAttribute('aria-current');
      }
    },
  );

  it('is hidden in print and not sticky', () => {
    renderAt('/');
    const banner = screen.getByRole('banner');
    expect(banner).toHaveClass('print:hidden');
    expect(banner.className).not.toMatch(/\b(sticky|fixed)\b/);
  });

  it('keeps every link at least 44 px tall (min-h-11)', () => {
    renderAt('/');
    for (const link of within(screen.getByRole('banner')).getAllByRole('link')) {
      expect(link).toHaveClass('min-h-11');
    }
  });
});
