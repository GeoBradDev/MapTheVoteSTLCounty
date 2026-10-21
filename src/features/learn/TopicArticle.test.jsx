import { render, screen, within } from '@testing-library/react';
import { Router } from 'wouter';
import { memoryLocation } from 'wouter/memory-location';
import { createRef } from 'react';
import TopicArticle, { LONG_SECTION_CHARS } from './TopicArticle.jsx';

const text = (value) => ({ type: 'text', value });

// A fixture shaped like the build's output; not voter guidance.
const topic = {
  id: 'fixture',
  locale: 'en',
  title: 'Fixture topic',
  group: 'get-help',
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

function renderTopic(t = topic, props = {}) {
  return render(
    <Router hook={memoryLocation({ path: '/learn/fixture' }).hook}>
      <TopicArticle topic={t} {...props} />
    </Router>,
  );
}

const paragraph = (value) => ({ type: 'paragraph', children: [text(value)] });
const heading = (level, value) => ({ type: 'heading', level, children: [text(value)] });

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

  it('shows a short section as a plain heading and its text', () => {
    const { container } = renderTopic();
    expect(container.querySelector('details')).toBeNull();
    expect(screen.getByRole('heading', { level: 2, name: 'A section' })).toBeVisible();
  });

  it('folds a long section into details, with its heading in the summary (#23)', () => {
    const long = 'x'.repeat(LONG_SECTION_CHARS);
    const { container } = renderTopic({
      ...topic,
      blocks: [
        paragraph('Intro text.'),
        heading(2, 'Long section'),
        paragraph(long.slice(0, 10)),
        heading(3, 'A part'),
        paragraph(long),
        heading(2, 'Short section'),
        paragraph('Short text.'),
      ],
    });
    const details = container.querySelectorAll('details');
    expect(details).toHaveLength(1);
    const [only] = details;
    expect(only.open).toBe(false);
    const summary = only.querySelector('summary');
    expect(within(summary).getByRole('heading', { level: 2 })).toHaveTextContent('Long section');
    expect(within(only).getByRole('heading', { level: 3, name: 'A part' })).toBeInTheDocument();
    // The intro and the short section stay outside it.
    expect(only).not.toHaveTextContent('Intro text.');
    expect(only).not.toHaveTextContent('Short text.');
    expect(
      screen.getByRole('heading', { level: 2, name: 'Short section' }).closest('details'),
    ).toBe(null);
  });

  it('counts a section as long only past the threshold', () => {
    const { container } = renderTopic({
      ...topic,
      blocks: [heading(2, 'Edge'), paragraph('y'.repeat(LONG_SECTION_CHARS - 1))],
    });
    expect(container.querySelector('details')).toBeNull();
  });

  it('can take focus on its title when the page asks for it', () => {
    const ref = createRef();
    renderTopic(topic, { headingRef: ref });
    expect(ref.current).toBe(screen.getByRole('heading', { level: 1 }));
    expect(ref.current).toHaveAttribute('tabindex', '-1');
  });

  it('marks the external links in the text so print shows where they go', () => {
    renderTopic({
      ...topic,
      blocks: [
        {
          type: 'paragraph',
          children: [
            { type: 'link', href: 'https://first.example.gov/c', children: [text('Off')] },
          ],
        },
      ],
    });
    expect(screen.getByRole('link', { name: 'Off' })).toHaveClass('print-href');
  });

  it('marks the source links so print shows where each one goes', () => {
    renderTopic();
    expect(screen.getByRole('link', { name: 'a page here' })).not.toHaveClass('print-href');
    const sources = screen.getByRole('region', { name: 'Sources' });
    for (const link of within(sources).getAllByRole('link')) {
      expect(link).toHaveClass('print-href');
    }
  });
});
