import { Link, useParams } from 'wouter';

// Placeholder until the results screen (#11) and shareable precinct URLs (#17).
export default function PrecinctPage() {
  const { precinct } = useParams();
  return (
    <>
      <h1 className="text-2xl font-semibold">Precinct {precinct}</h1>
      <p className="mt-4">
        <Link href="/" className="text-primary underline">
          Back to home
        </Link>
      </p>
    </>
  );
}
