import { Link } from 'wouter';

// Placeholder until the "How to vote" section (#23).
export default function LearnPage() {
  return (
    <>
      <h1 className="text-2xl font-semibold">How to vote</h1>
      <p className="mt-4">
        <Link href="/" className="text-primary underline">
          Back to home
        </Link>
      </p>
    </>
  );
}
