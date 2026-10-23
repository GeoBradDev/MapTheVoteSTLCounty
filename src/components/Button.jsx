import { Link } from 'wouter';
import { buttonClass } from './buttonClass.js';

/**
 * A button, or a link drawn as one (#78). At least 44 px tall. With `href` it
 * is a plain link (another site, a file, a full page load); with `to` an
 * in-app link; else a `button` (`type="button"` unless given). `busy` marks it
 * aria-disabled, so it keeps focus and stays in the tab order, and a press
 * while busy does nothing (#18). It guards only its own `onClick`: a submit
 * button's form checks its own busy state.
 * @param {{ variant?: 'primary' | 'secondary' | 'quiet', size?: 'md' | 'sm',
 *   stack?: boolean, busy?: boolean, href?: string, to?: string,
 *   type?: 'button' | 'submit', className?: string,
 *   onClick?: (event: import('react').MouseEvent) => void,
 *   children: import('react').ReactNode }} props Other props go to the element.
 */
export default function Button({
  variant,
  size,
  stack,
  busy = false,
  href,
  to,
  type = 'button',
  className = '',
  onClick,
  children,
  ...rest
}) {
  const classes = `${buttonClass({ variant, size, stack })} ${className}`.trim();
  if (to !== undefined) {
    return (
      <Link href={to} className={classes} {...rest}>
        {children}
      </Link>
    );
  }
  if (href !== undefined) {
    return (
      <a href={href} className={classes} {...rest}>
        {children}
      </a>
    );
  }
  return (
    <button
      type={type}
      onClick={(event) => {
        if (!busy) onClick?.(event);
      }}
      aria-disabled={busy || undefined}
      className={classes}
      {...rest}
    >
      {children}
    </button>
  );
}
