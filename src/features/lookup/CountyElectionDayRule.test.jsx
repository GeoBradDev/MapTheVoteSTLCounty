import { render, screen } from '@testing-library/react';
import election from '../../config/election.js';
import referrals from '../../config/referrals.js';
import { isOfficialUrl } from '../learn/content/officialSources.js';
import CountyElectionDayRule from './CountyElectionDayRule.jsx';
import { copy } from './countyElectionDayRuleCopy.js';

const rule = election.electionDayPollingPlace;

describe('CountyElectionDayRule', () => {
  // Owner decision on #152, reversing #72.
  it('says a registered County voter may vote at any polling place in the County (#152)', () => {
    render(<CountyElectionDayRule />);
    const ruleText = screen.getByText(copy.rule);
    expect(ruleText).toHaveTextContent(/^In St\. Louis County,/);
    expect(ruleText).toHaveTextContent(/registered voter may vote at any polling place/);
    expect(ruleText).toHaveTextContent(/on Election Day/);
  });

  it('says the rule does not apply in the City of St. Louis', () => {
    render(<CountyElectionDayRule />);
    expect(screen.getByText(copy.cityNote)).toHaveTextContent(
      /does not apply in the City of St\. Louis/,
    );
  });

  it('never says the voter must use an assigned polling place', () => {
    const { container } = render(<CountyElectionDayRule />);
    expect(container).not.toHaveTextContent(/assigned/i);
    expect(container).not.toHaveTextContent(/wrong polling place/i);
    expect(container).not.toHaveTextContent(/must vote at/i);
  });

  it("gives the county board's phone number as a link the phone can dial", () => {
    render(<CountyElectionDayRule />);
    const phone = screen.getByRole('link', { name: rule.phone });
    expect(phone).toHaveAttribute('href', `tel:+1${rule.phone.replaceAll('-', '')}`);
    expect(phone.closest('p')).toHaveTextContent(copy.help);
  });

  it("no longer links the Secretary of State's assigned polling place lookup", () => {
    const { container } = render(<CountyElectionDayRule />);
    expect(container.querySelector(`a[href="${referrals.moVoterOutreach.url}"]`)).toBeNull();
  });

  it('cites each source, and the page that lists the phone number, by a distinct name', () => {
    render(<CountyElectionDayRule />);
    const cited = [...rule.sources, rule.phoneSource];
    const names = cited.map((url) => copy.sourceNames[new URL(url).host]);
    expect(names.every(Boolean)).toBe(true);
    expect(new Set(names).size).toBe(names.length);
    cited.forEach((url, i) => {
      expect(screen.getByRole('link', { name: names[i] })).toHaveAttribute('href', url);
    });
  });

  it('links only to official government hosts', () => {
    const { container } = render(<CountyElectionDayRule />);
    for (const a of container.querySelectorAll('a')) {
      const href = a.getAttribute('href');
      if (href.startsWith('tel:')) continue;
      expect(isOfficialUrl(href)).toBe(true);
      expect(a).toHaveAttribute('rel', 'noreferrer');
    }
  });

  it('uses the link class it is given', () => {
    render(<CountyElectionDayRule linkClass="custom-link" />);
    for (const link of screen.getAllByRole('link')) expect(link).toHaveClass('custom-link');
  });
});
