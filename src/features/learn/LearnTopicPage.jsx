import { Link } from 'wouter';

// Placeholder until the "How to vote" section (#23). The content model (#21)
// is in place: #23 reads topics with getTopic from topics.js, renders them with
// TopicArticle, and shows the not-found page for an unknown topic.
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
