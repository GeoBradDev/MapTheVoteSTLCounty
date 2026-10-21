import { Link } from 'wouter';
import AddressLookup from '../features/lookup/AddressLookup.jsx';

// The host rewrites every path to index.html, so unknown paths land here
// instead of a host 404. It offers the address search, so a voter with a
// broken link can still look up their precinct.
export default function NotFoundPage() {
  return (
    <>
      <h1 className="text-2xl font-semibold">Page not found</h1>
      <p className="mt-4">There is no page at this address.</p>
      <p className="mt-4">
        <Link href="/" className="inline-flex min-h-11 items-center text-primary underline">
          Go to the home page
        </Link>
      </p>
      <div className="mt-6">
        <AddressLookup />
      </div>
    </>
  );
}
