import { render, screen } from '@testing-library/react';
import election from '../../config/election.js';
import referrals from '../../config/referrals.js';
import AssignedPollingPlace from './AssignedPollingPlace.jsx';
import { copy } from './assignedPollingPlaceCopy.js';

const rule = election.electionDayPollingPlace;

describe('AssignedPollingPlace', () => {
  it('says the voter must use their assigned polling place on Election Day (#72)', () => {
    const { container } = render(<AssignedPollingPlace />);
    expect(screen.getByText(copy.rule)).toBeInTheDocument();
    expect(container).toHaveTextContent(/must vote at your assigned polling place/);
    expect(container).toHaveTextContent(/provisional ballot cast at a different polling place/);
    expect(container).toHaveTextContent(/not counted/);
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

  it('cites each source by a distinct name', () => {
    render(<AssignedPollingPlace />);
    const names = rule.sources.map((url) => copy.sourceNames[new URL(url).host]);
    expect(names.every(Boolean)).toBe(true);
    expect(new Set(names).size).toBe(names.length);
    rule.sources.forEach((url, i) => {
      expect(screen.getByRole('link', { name: names[i] })).toHaveAttribute('href', url);
    });
  });

  it('links only to official government hosts', () => {
    const { container } = render(<AssignedPollingPlace />);
    for (const a of container.querySelectorAll('a')) {
      const href = a.getAttribute('href');
      if (href.startsWith('tel:')) continue;
      const { protocol, hostname } = new URL(href);
      expect(protocol).toBe('https:');
      expect(hostname).toMatch(/(^|\.)mo\.gov$/);
      expect(a).toHaveAttribute('rel', 'noreferrer');
    }
  });

  it('uses the link class it is given', () => {
    render(<AssignedPollingPlace linkClass="custom-link" />);
    for (const link of screen.getAllByRole('link')) expect(link).toHaveClass('custom-link');
  });
});
