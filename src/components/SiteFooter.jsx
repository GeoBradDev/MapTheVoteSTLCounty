import election from '../config/election.js';
import referrals from '../config/referrals.js';
import { copy } from './siteFooterCopy.js';
import TextLink from './TextLink.jsx';

// On every page, below main: that the site is nonpartisan and unofficial, with
// the official boards' sites (#71), and the link to the privacy notice (#20).
// A printed page keeps the statement and the boards' addresses; the Privacy
// link is not printed. Its rule spans the page and its text sits in the same
// column as the site header's and main's (#79).
export default function SiteFooter() {
  return (
    <footer className="border-t border-border text-sm">
      <div className="mx-auto w-full max-w-2xl px-4 py-4">
        <p>{copy.statement}</p>
        <ul aria-label={copy.officialSites} className="mt-1 flex flex-col">
          <li>
            <TextLink
              href={election.countySiteUrl}
              rel="noreferrer"
              variant="tap"
              className="print-href print:inline"
            >
              {copy.countySite}
            </TextLink>
          </li>
          <li>
            <TextLink
              href={referrals.stlCityBoard.url}
              rel="noreferrer"
              variant="tap"
              className="print-href print:inline"
            >
              {copy.citySite}
            </TextLink>
          </li>
        </ul>
        <p className="mt-2 print:hidden">
          <TextLink to="/privacy" variant="tap">
            {copy.privacy}
          </TextLink>
        </p>
      </div>
    </footer>
  );
}
