import { Link } from 'wouter';
import { formatCalendarDate } from '../../i18n/index.js';
import { learnCopy } from './learnCopy.js';

// Renders one voter education topic (#21) from the JSON node tree the build
// makes (content/markdown.js). Nothing here is parsed as HTML. A citation
// [^id] becomes a numbered link to that source's official page, and the
// numbers match the source list below the text. LearnTopicPage (#23) mounts it.
//
// Each `##` heading starts a section. A long section folds into
// <details>/<summary>, with its heading in the summary, so a voter can scan the
// headings first; the browser does the folding, and screen readers announce it.
// LearnTopicPage opens every one before printing.

const linkClass = 'text-primary underline';

/** A `##` section with at least this many characters of text is folded. */
export const LONG_SECTION_CHARS = 600;

function textLength(nodes) {
  return nodes.reduce((sum, node) => {
    if (node.type === 'text') return sum + node.value.length;
    return sum + (node.children ? textLength(node.children) : 0);
  }, 0);
}

function blockLength(block) {
  if (block.type === 'list') return block.items.reduce((sum, item) => sum + textLength(item), 0);
  return textLength(block.children);
}

/** Splits blocks into an intro (heading null) and one section per `##` heading. */
function sections(blocks) {
  const result = [{ heading: null, blocks: [] }];
  for (const block of blocks) {
    if (block.type === 'heading' && block.level === 2) result.push({ heading: block, blocks: [] });
    else result.at(-1).blocks.push(block);
  }
  return result.filter((section) => section.heading || section.blocks.length);
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
          <a key={i} href={node.href} className={`${linkClass} print-href`}>
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

function Section({ section, topic, copy }) {
  const body = section.blocks.map((block, i) => (
    <Block key={i} block={block} topic={topic} copy={copy} />
  ));
  if (!section.heading) return body;
  const heading = <Block block={section.heading} topic={topic} copy={copy} />;
  const length = section.blocks.reduce((sum, block) => sum + blockLength(block), 0);
  if (length < LONG_SECTION_CHARS) {
    return (
      <>
        {heading}
        {body}
      </>
    );
  }
  return (
    <details className="mt-8">
      <summary className="cursor-pointer [&>h2]:mt-0 [&>h2]:inline">{heading}</summary>
      {body}
    </details>
  );
}

/**
 * @param {{ topic: import('./content/topic.js').Topic,
 *   headingRef?: import('react').Ref<HTMLHeadingElement> }} props
 *   `headingRef` makes the title focusable from script, for a page that moves
 *   focus to it on arrival.
 */
export default function TopicArticle({ topic, headingRef }) {
  const copy = learnCopy[topic.locale] ?? learnCopy.en;
  const sourcesId = `${topic.id}-sources`;
  return (
    <article lang={topic.locale}>
      <h1
        ref={headingRef}
        tabIndex={headingRef ? -1 : undefined}
        className="text-2xl font-semibold"
      >
        {topic.title}
      </h1>
      {sections(topic.blocks).map((section, i) => (
        <Section key={i} section={section} topic={topic} copy={copy} />
      ))}
      <section aria-labelledby={sourcesId} className="mt-8">
        <h2 id={sourcesId} className="text-xl font-semibold">
          {copy.sourcesHeading}
        </h2>
        <ol className="mt-2 list-decimal space-y-2 pl-6">
          {topic.sources.map((source) => (
            <li key={source.id}>
              <a href={source.url} className={`${linkClass} print-href`}>
                {source.label}
              </a>
            </li>
          ))}
        </ol>
        <p className="mt-4 text-sm">
          {copy.lastVerified(
            formatCalendarDate(topic.lastVerified, { dateStyle: 'long' }, topic.locale),
          )}
        </p>
      </section>
    </article>
  );
}
