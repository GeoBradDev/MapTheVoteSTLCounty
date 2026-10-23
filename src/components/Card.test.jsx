import { render, screen } from '@testing-library/react';
import Card, { CARD, CARD_EMPHASIS } from './Card.jsx';

describe('Card', () => {
  it('is a region named by its h2 title, with its body', () => {
    render(
      <Card title="Polling places">
        <p>Body</p>
      </Card>,
    );
    const region = screen.getByRole('region', { name: 'Polling places' });
    expect(screen.getByRole('heading', { level: 2, name: 'Polling places' })).toHaveClass(
      'text-heading',
    );
    expect(region).toHaveTextContent('Body');
    expect(region).toHaveClass('rounded-card', 'border', 'shadow-card');
  });

  it('shows an optional summary line under the title', () => {
    render(
      <Card title="Districts" summary="Six districts">
        <p>Body</p>
      </Card>,
    );
    expect(screen.getByText('Six districts')).toHaveClass('text-muted');
  });

  it('has no summary line without one', () => {
    const { container } = render(<Card title="T">B</Card>);
    expect(container.querySelectorAll('p')).toHaveLength(0);
  });

  it('shares its box classes with placeholders and the summary', () => {
    expect(CARD).toContain('rounded-card');
    expect(CARD_EMPHASIS).toContain('border-primary');
  });
});
