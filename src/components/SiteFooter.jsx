import { Link } from 'wouter';

// On every page, below main: the link to the privacy notice (#20).
export default function SiteFooter() {
  return (
    <footer className="mx-auto w-full max-w-2xl border-t border-border px-4 py-4 text-sm">
      <Link href="/privacy" className="inline-flex min-h-11 items-center text-primary underline">
        Privacy
      </Link>
    </footer>
  );
}
