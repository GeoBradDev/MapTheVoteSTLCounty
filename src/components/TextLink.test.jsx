import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Router } from 'wouter';
import { memoryLocation } from 'wouter/memory-location';
import TextLink, { LINK } from './TextLink.jsx';

function inRouter(ui, path = '/') {
  const { hook } = memoryLocation({ path });
  return render(<Router hook={hook}>{ui}</Router>);
}

describe('TextLink', () => {
  it('is an underlined primary link set in the text by default', () => {
    inRouter(
      <TextLink href="https://example.org" rel="noreferrer">
        Source
      </TextLink>,
    );
    const link = screen.getByRole('link', { name: 'Source' });
    expect(link).toHaveAttribute('href', 'https://example.org');
    expect(link).toHaveAttribute('rel', 'noreferrer');
    expect(link).toHaveClass('text-primary', 'underline');
    expect(link).not.toHaveClass('min-h-11');
    expect(LINK).toBe('text-primary underline');
  });

  it('is an in-app link with to, which moves without a page load', async () => {
    const { hook, history } = memoryLocation({ path: '/', record: true });
    render(
      <Router hook={hook}>
        <TextLink to="/learn">How to vote</TextLink>
      </Router>,
    );
    const link = screen.getByRole('link', { name: 'How to vote' });
    expect(link).toHaveAttribute('href', '/learn');
    await userEvent.click(link);
    expect(history).toEqual(['/', '/learn']);
  });

  it.each([
    ['tap', ['inline-flex', 'min-h-11', 'items-center', 'underline']],
    ['row', ['flex', 'min-h-11', 'w-full', 'border', 'border-border-strong', 'underline']],
    ['nav', ['inline-flex', 'min-h-11', 'hover:underline']],
  ])('has a 44 px %s look', (variant, classes) => {
    inRouter(
      <TextLink to="/" variant={variant}>
        Home
      </TextLink>,
    );
    expect(screen.getByRole('link', { name: 'Home' })).toHaveClass(...classes);
  });

  it('passes other props and classes through', () => {
    inRouter(
      <TextLink href="/x" className="print-href" aria-current="page">
        X
      </TextLink>,
    );
    const link = screen.getByRole('link', { name: 'X' });
    expect(link).toHaveClass('print-href', 'text-primary');
    expect(link).toHaveAttribute('aria-current', 'page');
  });
});
