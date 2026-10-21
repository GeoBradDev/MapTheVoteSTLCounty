import { Link } from 'wouter';
import { learnCopy } from './learnCopy.js';

// Renders one voter education topic (#21) from the JSON node tree the build
// makes (content/markdown.js). Nothing here is parsed as HTML. A citation
// [^id] becomes a numbered link to that source's official page, and the
// numbers match the source list below the text. The "How to vote" pages (#23)
// mount this; no route does yet.

const linkClass = 'text-primary underline';

function formatDate(isoDate, locale) {
  return new Intl.DateTimeFormat(locale, { dateStyle: 'long', timeZone: 'UTC' }).format(
    new Date(`${isoDate}T00:00:00Z`),
  );
}

function Inline({ nodes, topic, copy }) {
  return nodes.map((node, i) => {
    switch (node.type) {
      case 'text':
        return node.value;
      case 'strong':
        return (
          <strong key={i}>
            <Inline nodes={node.children} topic={topic} copy={copy} />
          </strong>
        );
      case 'link':
        return node.href.startsWith('/') ? (
          <Link key={i} href={node.href} className={linkClass}>
            <Inline nodes={node.children} topic={topic} copy={copy} />
          </Link>
        ) : (
          <a key={i} href={node.href} className={linkClass}>
            <Inline nodes={node.children} topic={topic} copy={copy} />
          </a>
        );
      case 'cite': {
        const index = topic.sources.findIndex((s) => s.id === node.source);
        const source = topic.sources[index];
        return (
          <sup key={i}>
            <a
              href={source.url}
              className={linkClass}
              aria-label={copy.citationLabel(index + 1, source.label)}
            >
              [{index + 1}]
            </a>
          </sup>
        );
      }
      default:
        return null;
    }
  });
}

function Block({ block, topic, copy }) {
  const inline = (nodes) => <Inline nodes={nodes} topic={topic} copy={copy} />;
  switch (block.type) {
    case 'heading':
      return block.level === 2 ? (
        <h2 className="mt-8 text-xl font-semibold">{inline(block.children)}</h2>
      ) : (
        <h3 className="mt-6 font-semibold">{inline(block.children)}</h3>
      );
    case 'paragraph':
      return <p className="mt-4">{inline(block.children)}</p>;
    case 'list': {
      const List = block.ordered ? 'ol' : 'ul';
      return (
        <List className={`mt-4 space-y-2 pl-6 ${block.ordered ? 'list-decimal' : 'list-disc'}`}>
          {block.items.map((item, i) => (
            <li key={i}>{inline(item)}</li>
          ))}
        </List>
      );
    }
    default:
      return null;
  }
}

/**
 * @param {{ topic: import('./content/topic.js').Topic }} props
 */
export default function TopicArticle({ topic }) {
  const copy = learnCopy[topic.locale] ?? learnCopy.en;
  const sourcesId = `${topic.id}-sources`;
  return (
    <article lang={topic.locale}>
      <h1 className="text-2xl font-semibold">{topic.title}</h1>
      {topic.blocks.map((block, i) => (
        <Block key={i} block={block} topic={topic} copy={copy} />
      ))}
      <section aria-labelledby={sourcesId} className="mt-8">
        <h2 id={sourcesId} className="text-xl font-semibold">
          {copy.sourcesHeading}
        </h2>
        <ol className="mt-2 list-decimal space-y-2 pl-6">
          {topic.sources.map((source) => (
            <li key={source.id}>
              <a href={source.url} className={linkClass}>
                {source.label}
              </a>
            </li>
          ))}
        </ol>
        <p className="mt-4 text-sm">
          {copy.lastVerified(formatDate(topic.lastVerified, topic.locale))}
        </p>
      </section>
    </article>
  );
}
