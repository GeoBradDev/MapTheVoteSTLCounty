import { Link } from 'wouter';
import { t } from '../i18n/index.js';

// On every page, below main: the link to the privacy notice (#20).
export default function SiteFooter() {
  return (
    <footer className="mx-auto w-full max-w-2xl border-t border-border px-4 py-4 text-sm print:hidden">
      <Link href="/privacy" className="inline-flex min-h-11 items-center text-primary underline">
        {t('footer.privacy')}
      </Link>
    </footer>
  );
}
