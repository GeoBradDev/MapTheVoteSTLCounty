import { Link } from 'wouter';
import election from '../config/election.js';
import referrals from '../config/referrals.js';
import { copy } from './siteFooterCopy.js';

const linkClass = 'inline-flex min-h-11 items-center text-primary underline';

// On every page, below main: that the site is nonpartisan and unofficial, with
// the official boards' sites (#71), and the link to the privacy notice (#20).
// A printed page keeps the statement and the boards' addresses; the Privacy
// link is not printed.
export default function SiteFooter() {
  return (
    <footer className="mx-auto w-full max-w-2xl border-t border-border px-4 py-4 text-sm">
      <p>{copy.statement}</p>
      <ul aria-label={copy.officialSites} className="mt-1 flex flex-col">
        <li>
          <a
            href={election.countySiteUrl}
            rel="noreferrer"
            className={`${linkClass} print-href print:inline`}
          >
            {copy.countySite}
          </a>
        </li>
        <li>
          <a
            href={referrals.stlCityBoard.url}
            rel="noreferrer"
            className={`${linkClass} print-href print:inline`}
          >
            {copy.citySite}
          </a>
        </li>
      </ul>
      <p className="mt-2 print:hidden">
        <Link href="/privacy" className={linkClass}>
          {copy.privacy}
        </Link>
      </p>
    </footer>
  );
}
