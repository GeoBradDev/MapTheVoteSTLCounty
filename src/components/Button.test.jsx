import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Router } from 'wouter';
import { memoryLocation } from 'wouter/memory-location';
import Button from './Button.jsx';
import { buttonClass } from './buttonClass.js';

describe('Button', () => {
  it('is a 44 px button of the primary look by default', () => {
    render(<Button>Find</Button>);
    const button = screen.getByRole('button', { name: 'Find' });
    expect(button).toHaveAttribute('type', 'button');
    expect(button).toHaveClass('min-h-11', 'bg-primary', 'text-on-primary', 'rounded-control');
  });

  it.each([
    ['secondary', ['border-2', 'border-primary', 'text-primary']],
    ['quiet', ['border', 'border-border', 'text-primary']],
  ])('has the %s look', (variant, classes) => {
    render(<Button variant={variant}>Go</Button>);
    const button = screen.getByRole('button', { name: 'Go' });
    expect(button).toHaveClass('min-h-11', ...classes);
    expect(button).not.toHaveClass('bg-primary');
  });

  it('has a small size for a quiet button in a row', () => {
    expect(buttonClass({ variant: 'quiet', size: 'sm' })).toMatch(/\bpx-3\b.*\btext-sm\b/);
    expect(buttonClass({ variant: 'quiet', size: 'sm' })).toContain('min-h-11');
  });

  it('marks itself busy and ignores a press while busy', async () => {
    const onClick = vi.fn();
    const { rerender } = render(
      <Button busy onClick={onClick}>
        Try again
      </Button>,
    );
    const button = screen.getByRole('button', { name: 'Try again' });
    expect(button).toHaveAttribute('aria-disabled', 'true');
    // Still focusable: aria-disabled, not disabled.
    expect(button).not.toBeDisabled();
    await userEvent.click(button);
    expect(onClick).not.toHaveBeenCalled();
    rerender(<Button onClick={onClick}>Try again</Button>);
    expect(button).not.toHaveAttribute('aria-disabled');
    await userEvent.click(button);
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('is a submit button when asked', () => {
    render(<Button type="submit">Find</Button>);
    expect(screen.getByRole('button')).toHaveAttribute('type', 'submit');
  });

  it('is a plain link with href and an in-app link with to', () => {
    const { hook } = memoryLocation({ path: '/' });
    render(
      <Router hook={hook}>
        <Button href="https://example.org/a.pdf" variant="secondary">
          Ballot
        </Button>
        <Button to="/early-voting">Waits</Button>
      </Router>,
    );
    const plain = screen.getByRole('link', { name: 'Ballot' });
    expect(plain).toHaveAttribute('href', 'https://example.org/a.pdf');
    expect(plain).toHaveClass('min-h-11', 'border-primary');
    const inApp = screen.getByRole('link', { name: 'Waits' });
    expect(inApp).toHaveAttribute('href', '/early-voting');
    expect(inApp).toHaveClass('bg-primary');
  });

  it('adds layout classes from the caller', () => {
    render(<Button className="mt-2 w-full">Go</Button>);
    expect(screen.getByRole('button')).toHaveClass('mt-2', 'w-full');
  });
});
