// Fixture topics for the "How to vote" page tests (#23). They are shaped like
// the build's output but are not voter guidance: content/en/learn/ ships
// empty until #22. Tests mock topics.js with lookups over these.

import { LONG_SECTION_CHARS } from '../features/learn/TopicArticle.jsx';

const text = (value) => ({ type: 'text', value });
const paragraph = (value) => ({ type: 'paragraph', children: [text(value)] });
const heading = (level, value) => ({ type: 'heading', level, children: [text(value)] });

function fixture(id, title, group, blocks) {
  return {
    id,
    locale: 'en',
    title,
    group,
    election: '2000-01-04',
    lastVerified: '2000-01-02',
    sources: [{ id: 'one', label: `${title} official source`, url: `https://example.gov/${id}` }],
    blocks: [
      {
        type: 'paragraph',
        children: [text(`Fixture text for ${title}.`), { type: 'cite', source: 'one' }],
      },
      ...blocks,
    ],
  };
}

export const fixtureTopics = [
  fixture('help-desk', 'Fixture help topic', 'get-help', []),
  fixture('voter-id', 'Fixture ID topic', 'before-you-vote', [
    heading(2, 'Fixture short section'),
    paragraph('Short fixture text.'),
  ]),
  fixture('absentee', 'Fixture absentee topic', 'ways-to-vote', []),
  fixture('at-polls', 'Fixture polls topic', 'at-the-polls', [
    heading(2, 'Fixture long section'),
    paragraph('z'.repeat(LONG_SECTION_CHARS)),
    heading(3, 'Fixture part'),
    { type: 'list', ordered: true, items: [[text('Step one')], [text('Step two')]] },
  ]),
  fixture('register', 'A fixture registration topic', 'before-you-vote', []),
  fixture('second-long', 'Fixture second long topic', 'get-help', [
    heading(2, 'Fixture other long section'),
    paragraph('w'.repeat(LONG_SECTION_CHARS)),
  ]),
];
