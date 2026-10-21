import { render, screen, within } from '@testing-library/react';
import { Router } from 'wouter';
import { memoryLocation } from 'wouter/memory-location';
import TopicArticle from './TopicArticle.jsx';

const text = (value) => ({ type: 'text', value });

// A fixture shaped like the build's output; not voter guidance.
const topic = {
  id: 'fixture',
  locale: 'en',
  title: 'Fixture topic',
  election: '2000-01-04',
  lastVerified: '2000-01-02',
  sources: [
    { id: 'first', label: 'First official source', url: 'https://first.example.gov/a' },
    { id: 'second', label: 'Second official source', url: 'https://second.example.gov/b' },
  ],
  blocks: [
    { type: 'heading', level: 2, children: [text('A section')] },
    {
      type: 'paragraph',
      children: [
        text('A claim'),
        { type: 'cite', source: 'second' },
        text(' and '),
        { type: 'strong', children: [text('a bold part')] },
        text(', see '),
        { type: 'link', href: '/privacy', children: [text('a page here')] },
        text('.'),
      ],
    },
    { type: 'list', ordered: true, items: [[text('Step one')], [text('Step two')]] },
  ],
};

function renderTopic(t = topic) {
  return render(
    <Router hook={memoryLocation({ path: '/learn/fixture' }).hook}>
      <TopicArticle topic={t} />
    </Router>,
  );
}

describe('TopicArticle', () => {
  it('renders the title, headings, paragraphs and lists', () => {
    renderTopic();
    expect(screen.getByRole('heading', { level: 1, name: 'Fixture topic' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 2, name: 'A section' })).toBeInTheDocument();
    expect(screen.getByText('a bold part').tagName).toBe('STRONG');
    const steps = screen.getAllByRole('list')[0];
    expect(
      within(steps)
        .getAllByRole('listitem')
        .map((li) => li.textContent),
    ).toEqual(['Step one', 'Step two']);
  });

  it('renders a citation as a numbered link to its source, matching the source list', () => {
    renderTopic();
    const cite = screen.getByRole('link', { name: 'Source 2: Second official source' });
    expect(cite).toHaveAttribute('href', 'https://second.example.gov/b');
    expect(cite).toHaveTextContent('[2]');
    const sources = screen.getByRole('region', { name: 'Sources' });
    const items = within(sources).getAllByRole('listitem');
    expect(within(items[1]).getByRole('link')).toHaveAttribute(
      'href',
      'https://second.example.gov/b',
    );
  });

  it('links a site path inside the app', () => {
    renderTopic();
    expect(screen.getByRole('link', { name: 'a page here' })).toHaveAttribute('href', '/privacy');
  });

  it('shows the last verified date, read as a calendar day', () => {
    renderTopic();
    expect(
      screen.getByText('Last checked against these sources on January 2, 2000.'),
    ).toBeInTheDocument();
  });

  it('marks the language and falls back to English labels for a locale with no copy yet', () => {
    const { container } = renderTopic({ ...topic, locale: 'es' });
    expect(container.querySelector('article')).toHaveAttribute('lang', 'es');
    expect(screen.getByRole('region', { name: 'Sources' })).toBeInTheDocument();
  });
});
