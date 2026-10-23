import AddressLookup from '../features/lookup/AddressLookup.jsx';
import { t } from '../i18n/index.js';
import TextLink from './TextLink.jsx';
import { usePageTitle } from './usePageTitle.js';

// The host rewrites every path with no file to the app shell (shell.html),
// so unknown paths land here instead of a host 404. It offers the address
// search, so a voter with a broken link can still look up their precinct.
export default function NotFoundPage() {
  const heading = t('notFound.heading');
  usePageTitle(heading);
  return (
    <>
      {/* Focusable from script: the app moves focus here after an in-app link. */}
      <h1 tabIndex={-1} className="text-title font-bold">
        {heading}
      </h1>
      <p className="mt-4">{t('notFound.body')}</p>
      <p className="mt-4">
        <TextLink to="/" variant="tap">
          {t('notFound.home')}
        </TextLink>
      </p>
      <div className="mt-6">
        <AddressLookup />
      </div>
    </>
  );
}
