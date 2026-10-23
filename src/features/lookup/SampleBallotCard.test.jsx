// Fixtures are live responses recorded by scripts/record-fixtures.mjs, so no
// election-specific URL is written here.
import { render, screen } from '@testing-library/react';
import cc007 from '../../../docs/raw/fixtures/precinct-by-id.json';
import flo030 from '../../../docs/raw/fixtures/precinct-by-id-flo030.json';
import mer013 from '../../../docs/raw/fixtures/precinct-by-id-mer013.json';
import nonresidential from '../../../docs/raw/fixtures/precinct-nonresidential.json';
import election from '../../config/election.js';
import SampleBallotCard from './SampleBallotCard.jsx';
import { copy } from './resultsCopy.js';

const htmlOf = (fixture) => fixture.features[0].attributes.html;
const hrefIn = (html) => html.match(/href=(\S+?)>/)[1];

const escape = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const OPEN = new RegExp(`^${escape(copy.ballot.open)}`);
const ballotLink = () => screen.getByRole('link', { name: OPEN });

function expectFallback() {
  expect(screen.getByText(new RegExp(escape(copy.ballot.missing)))).toBeInTheDocument();
  expect(screen.getByRole('link', { name: copy.officialLookup })).toHaveAttribute(
    'href',
    election.officialLookupUrl,
  );
  expect(screen.queryByRole('link', { name: OPEN })).toBeNull();
}

describe('SampleBallotCard', () => {
  it.each([
    ['CC007', cc007, 'CC-007.pdf'],
    ['MER013', mer013, 'MER-013.pdf'],
    ['FLO030', flo030, 'FLO-030.pdf'],
  ])('links the sample ballot PDF for %s', (code, fixture, fileName) => {
    const html = htmlOf(fixture);
    render(<SampleBallotCard html={html} code={code} />);
    const link = ballotLink();
    expect(link).toHaveAttribute('href', hrefIn(html));
    expect(link).toHaveTextContent(copy.ballot.open);
    expect(link).toHaveTextContent(fileName);
  });

  it('opens in a new tab without an opener, and says so to screen readers', () => {
    render(<SampleBallotCard html={htmlOf(cc007)} code="CC007" />);
    const link = ballotLink();
    expect(link).toHaveAttribute('target', '_blank');
    expect(link.getAttribute('rel').split(' ')).toEqual(
      expect.arrayContaining(['noopener', 'noreferrer']),
    );
    expect(link).toHaveAccessibleName(`${copy.ballot.open} CC-007.pdf ${copy.ballot.newTab}`);
    expect(screen.getByText(copy.ballot.newTab)).toHaveClass('sr-only');
  });

  it('leaves the intro to the summary part around it', () => {
    const { container } = render(<SampleBallotCard html={htmlOf(cc007)} code="CC007" />);
    expect(container.textContent).not.toContain(copy.ballot.intro);
  });

  // #82: a link is shown only when its file name names this precinct, so a
  // swapped link never shows another precinct's contests as the voter's own.
  it('links the official lookup instead when the file names another precinct', () => {
    render(<SampleBallotCard html={htmlOf(mer013)} code="CC007" />);
    expectFallback();
    expect(screen.queryByText(/MER-013/)).toBeNull();
  });

  it('links the official lookup instead when the link has no file name', () => {
    const html = htmlOf(cc007).replace('CC-007.pdf', '');
    render(<SampleBallotCard html={html} code="CC007" />);
    expectFallback();
  });

  it('links the official lookup instead when no precinct code is given', () => {
    render(<SampleBallotCard html={htmlOf(cc007)} />);
    expectFallback();
  });

  it.each([
    ['the field is empty', null],
    ['the field is plain text', htmlOf(nonresidential)],
    [
      'the link is not a county sample ballot',
      'Sample Ballot: <a href=https://example.org/x.pdf>CC-007.pdf</a>',
    ],
    ['the field cannot be read', '<script>alert(1)</script>'],
  ])('links the official lookup instead when %s', (_, html) => {
    render(<SampleBallotCard html={html} code="CC007" />);
    expectFallback();
    expect(screen.queryByText('alert(1)')).toBeNull();
    expect(document.querySelector('script')).toBeNull();
  });
});
