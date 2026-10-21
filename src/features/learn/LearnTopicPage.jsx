import { Link } from 'wouter';

// Placeholder until the content model (#21) and "How to vote" section (#23).
// Unknown topics should show the not-found page once topics exist.
export default function LearnTopicPage() {
  return (
    <>
      <h1 className="text-2xl font-semibold">Voting topic</h1>
      <p className="mt-4">
        <Link href="/learn" className="text-primary underline">
          All topics
        </Link>
      </p>
    </>
  );
}
