import { Link } from 'wouter';

// The host rewrites every path to index.html, so unknown paths land here
// instead of a host 404. The address search joins this page in #10.
export default function NotFoundPage() {
  return (
    <>
      <h1 className="text-2xl font-semibold">Page not found</h1>
      <p className="mt-4">There is no page at this address.</p>
      <p className="mt-4">
        <Link href="/" className="text-primary underline">
          Go to the home page
        </Link>
      </p>
    </>
  );
}
