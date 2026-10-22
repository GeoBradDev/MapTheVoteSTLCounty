import { render, screen } from '@testing-library/react';
import election from '../../config/election.js';
import referrals from '../../config/referrals.js';
import { isOfficialUrl } from '../learn/content/officialSources.js';
import AssignedPollingPlace from './AssignedPollingPlace.jsx';
import { copy } from './assignedPollingPlaceCopy.js';

const rule = election.electionDayPollingPlace;

describe('AssignedPollingPlace', () => {
  it('says the voter must use their assigned polling place on Election Day (#72)', () => {
    const { container } = render(<AssignedPollingPlace />);
    expect(screen.getByText(copy.rule)).toBeInTheDocument();
    expect(container).toHaveTextContent(/must vote at your assigned polling place/);
    // County only: the City of St. Louis has its own board and rule (#89).
    expect(screen.getByText(copy.rule)).toHaveTextContent(/^In St\. Louis County,/);
    expect(container).toHaveTextContent(/provisional ballot cast at the wrong polling place/);
    expect(container).toHaveTextContent(/not counted/);
  });

  it("mentions the central polling place with the Secretary of State's hedge", () => {
    render(<AssignedPollingPlace />);
    expect(screen.getByText(copy.central)).toHaveTextContent(
      /may be able to vote at a central polling place/,
    );
  });

  it('never says any polling place works', () => {
    const { container } = render(<AssignedPollingPlace />);
    expect(container).not.toHaveTextContent(/any polling place/i);
  });

  it("gives the county board's phone number as a link the phone can dial", () => {
    render(<AssignedPollingPlace />);
    const phone = screen.getByRole('link', { name: rule.phone });
    expect(phone).toHaveAttribute('href', `tel:+1${rule.phone.replaceAll('-', '')}`);
    expect(phone.closest('p')).toHaveTextContent(copy.confirm);
  });

  it("links the Secretary of State's lookup, with the state's own hedge", () => {
    render(<AssignedPollingPlace />);
    const link = screen.getByRole('link', { name: copy.stateLookup });
    expect(link).toHaveAttribute('href', referrals.moVoterOutreach.url);
    expect(link.closest('p')).toHaveTextContent(/may also be able to find it/);
  });

  it('cites each source, and the page that lists the phone number, by a distinct name', () => {
    render(<AssignedPollingPlace />);
    const cited = [...rule.sources, rule.phoneSource];
    const names = cited.map((url) => copy.sourceNames[new URL(url).host]);
    expect(names.every(Boolean)).toBe(true);
    expect(new Set(names).size).toBe(names.length);
    cited.forEach((url, i) => {
      expect(screen.getByRole('link', { name: names[i] })).toHaveAttribute('href', url);
    });
  });

  it('links only to official government hosts', () => {
    const { container } = render(<AssignedPollingPlace />);
    for (const a of container.querySelectorAll('a')) {
      const href = a.getAttribute('href');
      if (href.startsWith('tel:')) continue;
      expect(isOfficialUrl(href)).toBe(true);
      expect(a).toHaveAttribute('rel', 'noreferrer');
    }
  });

  it('uses the link class it is given', () => {
    render(<AssignedPollingPlace linkClass="custom-link" />);
    for (const link of screen.getAllByRole('link')) expect(link).toHaveClass('custom-link');
  });
});
