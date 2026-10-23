import { useId } from 'react';

/** A card's box, also for placeholders that hold a card's place. */
export const CARD = 'rounded-card border border-border bg-surface p-4 shadow-card';
/** The box of the one answer a page leads with (the results summary, #81). */
export const CARD_EMPHASIS =
  'rounded-card border-2 border-primary bg-surface-raised p-4 shadow-card';

/**
 * A section of secondary detail (#78): a region named by its `h2` title, an
 * optional one-line summary under it, then the body.
 * @param {{ title: import('react').ReactNode, summary?: import('react').ReactNode,
 *   className?: string, children: import('react').ReactNode }} props
 */
export default function Card({ title, summary, className = '', children }) {
  const headingId = useId();
  return (
    <section aria-labelledby={headingId} className={`${CARD} ${className}`.trim()}>
      <h2 id={headingId} className="text-heading font-semibold">
        {title}
      </h2>
      {summary && <p className="mt-1 text-muted">{summary}</p>}
      {children}
    </section>
  );
}
