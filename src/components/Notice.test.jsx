import { render, screen } from '@testing-library/react';
import Notice from './Notice.jsx';

describe('Notice', () => {
  it.each([
    ['info', 'border-notice-info'],
    ['warning', 'border-notice-warning'],
    ['danger', 'border-notice-danger'],
  ])('has the %s look', (variant, border) => {
    render(<Notice variant={variant}>Text</Notice>);
    const notice = screen.getByText('Text');
    expect(notice).toHaveClass('border-l-4', border, 'bg-surface-raised');
  });

  it('is a paragraph of the info look by default', () => {
    render(<Notice>Text</Notice>);
    const notice = screen.getByText('Text');
    expect(notice.tagName).toBe('P');
    expect(notice).toHaveClass('border-notice-info');
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
