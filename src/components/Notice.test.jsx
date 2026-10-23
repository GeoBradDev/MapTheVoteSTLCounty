import { render, screen } from '@testing-library/react';
import Notice from './Notice.jsx';

describe('Notice', () => {
  // #76: a fill, an edge and an icon per kind, so a notice never relies on
  // color alone (the edge and icon stay in forced colors).
  it.each(['info', 'warning', 'danger', 'success'])('has the %s look and icon', (variant) => {
    const { container } = render(<Notice variant={variant}>Text</Notice>);
    const notice = container.firstElementChild;
    expect(notice).toHaveClass(
      'border-l-4',
      `border-${variant}-ink`,
      `bg-${variant}-fill`,
      'text-ink',
    );
    const icon = notice.querySelector('svg');
    expect(icon).toHaveAttribute('aria-hidden', 'true');
    expect(icon).toHaveAttribute('stroke', 'currentColor');
    expect(icon).toHaveClass(`text-${variant}-ink`);
    expect(icon.getAttribute('data-notice-icon')).toBe(variant);
    expect(notice).toHaveTextContent(/^Text$/);
  });

  it('gives each kind its own icon', () => {
    const shapes = ['info', 'warning', 'danger', 'success'].map((variant) => {
      const { container } = render(<Notice variant={variant}>Text</Notice>);
      return container.querySelector('svg').innerHTML;
    });
    expect(new Set(shapes).size).toBe(4);
  });

  it('is a paragraph of the info look by default, its text in a span', () => {
    const { container } = render(<Notice>Text</Notice>);
    const notice = container.firstElementChild;
    expect(notice.tagName).toBe('P');
    expect(notice).toHaveClass('border-info-ink');
    expect(screen.getByText('Text').tagName).toBe('SPAN');
  });

  it('holds block content in a div when it is not a paragraph', () => {
    render(
      <Notice as="section" aria-label="Status">
        <p>Body</p>
      </Notice>,
    );
    expect(screen.getByText('Body').parentElement.tagName).toBe('DIV');
  });

  it('renders as another element with its role and label', () => {
    render(
      <Notice as="section" variant="warning" aria-label="Precinct status" className="mt-6">
        <p>Nothing to vote on</p>
      </Notice>,
    );
    const region = screen.getByRole('region', { name: 'Precinct status' });
    expect(region.tagName).toBe('SECTION');
    expect(region).toHaveClass('mt-6');
  });

  it('can be an alert', () => {
    render(
      <Notice role="alert" variant="danger">
        Failed
      </Notice>,
    );
    expect(screen.getByRole('alert')).toHaveTextContent('Failed');
  });
});
