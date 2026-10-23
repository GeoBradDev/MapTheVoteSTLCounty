import { Link } from 'wouter';

/** The link look: primary and underlined. For text drawn in a link's place. */
export const LINK = 'text-primary underline';

const VARIANTS = {
  // In a line of text: inline, so WCAG's target size criteria exempt it.
  inline: LINK,
  // On a line of its own: a 44 px box.
  tap: `inline-flex min-h-11 items-center ${LINK}`,
  // A full-width tappable row, as in a list of places to go (#80).
  row: `flex min-h-11 w-full items-center rounded-control border border-border-strong bg-surface-raised px-4 py-2 font-medium ${LINK}`,
  // The site header's links (#79): underlined on hover and on the current page.
  nav: 'inline-flex min-h-11 items-center px-1 text-primary underline-offset-4 hover:underline aria-[current=page]:font-semibold aria-[current=page]:underline',
};

/**
 * A link that reads as a link (#78). With `to`, an in-app link (wouter); with
 * `href`, a plain one (another site, `tel:`, or a full page load). Other props
 * (rel, aria-*) go to the element.
 * @param {{ to?: string, href?: string,
 *   variant?: 'inline' | 'tap' | 'row' | 'nav', className?: string,
 *   children: import('react').ReactNode }} props
 */
export default function TextLink({
  to,
  href,
  variant = 'inline',
  className = '',
  children,
  ...rest
}) {
  const classes = `${VARIANTS[variant]} ${className}`.trim();
  if (to !== undefined) {
    return (
      <Link href={to} className={classes} {...rest}>
        {children}
      </Link>
    );
  }
  return (
    <a href={href} className={classes} {...rest}>
      {children}
    </a>
  );
}
