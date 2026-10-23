// Fixtures are live responses recorded by scripts/record-fixtures.mjs.
import { render, screen, within } from '@testing-library/react';
import cc007 from '../../../docs/raw/fixtures/precinct-by-id.json';
import nw005 from '../../../docs/raw/fixtures/precinct-by-id-nw005.json';
import election from '../../config/election.js';
import DistrictsCard from './DistrictsCard.jsx';
import { districtRows } from './districts.js';
import { copy } from './resultsCopy.js';

const attributesOf = (fixture) => fixture.features[0].attributes;
const list = () => document.querySelector('dl');

describe('DistrictsCard', () => {
  it.each([
    ['CC007', cc007],
    ['NW005', nw005],
  ])('lists each district for %s as a term and its value', (_, fixture) => {
    const precinct = attributesOf(fixture);
    render(<DistrictsCard precinct={precinct} />);
    const dl = list();
    expect(dl).not.toBeNull();
    // Only dt and dd children, in pairs, so the list reads as label then value.
    const children = [...dl.children];
    expect(children.map((c) => c.tagName)).toEqual(
      districtRows(precinct).flatMap(() => ['DT', 'DD']),
    );
    expect(children.map((c) => c.textContent)).toEqual(
      districtRows(precinct).flatMap(({ label, value }) => [label, value]),
    );
  });

  it('cites the county data', () => {
    render(<DistrictsCard precinct={attributesOf(cc007)} />);
    expect(screen.getByText(copy.districts.source)).toBeInTheDocument();
  });

  it('shows the county value text as text, not markup', () => {
    render(<DistrictsCard precinct={{ fire: '<b>Fire</b>' }} />);
    expect(within(list()).getByText('<b>Fire</b>')).toBeInTheDocument();
    expect(list().querySelector('b')).toBeNull();
  });

  it.each([
    ['no precinct', null],
    ['no district values', { precinct: 'CC007', sewer: 'No Sewer District', ward: '' }],
  ])('points to the official lookup when there is %s', (_, precinct) => {
    render(<DistrictsCard precinct={precinct} />);
    expect(list()).toBeNull();
    expect(screen.getByText(new RegExp(copy.districts.missing))).toBeInTheDocument();
    expect(screen.getByRole('link', { name: copy.officialLookup })).toHaveAttribute(
      'href',
      election.officialLookupUrl,
    );
  });
});

// Owner decision on #81: folded away on phones, open on wider screens.
describe('DistrictsCard on phones and wide screens', () => {
  const screenWidth = (width) =>
    vi.stubGlobal('matchMedia', (query) => ({
      matches: query === '(min-width: 640px)' && width >= 640,
    }));
  afterEach(() => vi.unstubAllGlobals());
  const details = () => list().closest('details');

  it('starts folded on a phone, and opens from its summary line', async () => {
    screenWidth(360);
    render(<DistrictsCard precinct={attributesOf(cc007)} />);
    expect(details()).not.toHaveAttribute('open');
    expect(screen.getByText(copy.districts.show).tagName).toBe('SUMMARY');
    screen.getByText(copy.districts.show).click();
    expect(details()).toHaveAttribute('open');
  });

  it('starts open on a wide screen', () => {
    screenWidth(1280);
    render(<DistrictsCard precinct={attributesOf(cc007)} />);
    expect(details()).toHaveAttribute('open');
  });
});
