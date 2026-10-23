const VARIANTS = {
  // Where to go instead, or something to know.
  info: 'border-notice-info',
  // Something about this precinct that changes what the voter can do.
  warning: 'border-notice-warning',
  // Something failed.
  danger: 'border-notice-danger',
};

/**
 * A message set apart from the page (#78), with a bar in its kind's color.
 * The colors are aliases in src/index.css, for #76 to tune. For an error
 * that is announced, pass `role="alert"`; where the live region must stay
 * mounted while empty, keep it outside and render the Notice in it only
 * while it has text.
 * @param {{ variant?: 'info' | 'warning' | 'danger', as?: string,
 *   className?: string, children: import('react').ReactNode }} props
 *   `as` is the element (a paragraph by default). Other props go to it.
 */
export default function Notice({
  variant = 'info',
  as: Tag = 'p',
  className = '',
  children,
  ...rest
}) {
  return (
    <Tag
      className={`rounded-card border-l-4 ${VARIANTS[variant]} bg-surface-raised px-4 py-3 ${className}`.trim()}
      {...rest}
    >
      {children}
    </Tag>
  );
}
