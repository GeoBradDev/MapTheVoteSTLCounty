const BASE =
  'inline-flex min-h-11 rounded-control font-semibold aria-disabled:cursor-wait aria-disabled:opacity-70';
const VARIANTS = {
  // The one main action of a screen.
  primary: 'bg-primary text-on-primary hover:bg-primary-hover active:bg-primary-pressed',
  // An action beside the main one, or the main one where a fill would shout.
  secondary: 'border-2 border-primary bg-surface text-primary hover:bg-surface-raised',
  // A small action inside a list or a row: show more, share.
  quiet: 'border border-border-strong text-primary hover:bg-surface-raised',
};
const SIZES = { md: 'px-4 py-2', sm: 'px-3 text-sm' };

/**
 * The classes of a Button (#78), for a placeholder that must take a button's
 * exact place (ShareLinkPlaceholder). Anything that can be pressed uses Button.
 * @param {{ variant?: 'primary' | 'secondary' | 'quiet', size?: 'md' | 'sm',
 *   stack?: boolean }} [options] `stack` sets the label's lines one under the
 *   other, left-aligned, as on the sample ballot link.
 */
export function buttonClass({ variant = 'primary', size = 'md', stack = false } = {}) {
  const layout = stack ? 'flex-col justify-center' : 'items-center justify-center gap-2';
  return `${BASE} ${layout} ${VARIANTS[variant]} ${SIZES[size]}`;
}
