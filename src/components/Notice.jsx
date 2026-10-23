// Each kind's look (#76): its fill, its edge and icon in its ink. Text inside
// stays ink. The edge and the icon carry the kind without color, and both
// stay in forced colors, where the fill is removed.
const VARIANTS = {
  // Where to go instead, or something to know.
  info: { box: 'border-info-ink bg-info-fill', icon: 'text-info-ink', path: 'M12 11v6M12 7.5v.01' },
  // Something about this precinct that changes what the voter can do.
  warning: {
    box: 'border-warning-ink bg-warning-fill',
    icon: 'text-warning-ink',
    path: 'M12 9.5v4M12 17v.01',
    shape: 'M10.3 3.9 2.4 17.5A2 2 0 0 0 4.1 20.5h15.8a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z',
  },
  // Something failed.
  danger: {
    box: 'border-danger-ink bg-danger-fill',
    icon: 'text-danger-ink',
    path: 'M12 7v6M12 16.5v.01',
    shape: 'M8.3 2.5h7.4l5.8 5.8v7.4l-5.8 5.8H8.3l-5.8-5.8V8.3z',
  },
  // Something worked.
  success: {
    box: 'border-success-ink bg-success-fill',
    icon: 'text-success-ink',
    path: 'm8 12.5 3 3 5-6',
  },
};

function NoticeIcon({ kind }) {
  const { icon, path, shape } = VARIANTS[kind];
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={`mt-0.5 size-5 shrink-0 ${icon}`}
      data-notice-icon={kind}
    >
      {shape ? <path d={shape} /> : <circle cx="12" cy="12" r="9.5" />}
      <path d={path} />
    </svg>
  );
}

/**
 * A message set apart from the page (#78), with a tinted fill, an edge and an
 * icon of its kind (#76), so it never relies on color alone. For an error
 * that is announced, pass `role="alert"`; where the live region must stay
 * mounted while empty, keep it outside and render the Notice in it only
 * while it has text.
 * @param {{ variant?: 'info' | 'warning' | 'danger' | 'success', as?: string,
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
  // A paragraph may hold only phrasing content, so its text goes in a span.
  const Body = Tag === 'p' || Tag === 'span' ? 'span' : 'div';
  return (
    <Tag
      className={`flex gap-3 rounded-card border-l-4 ${VARIANTS[variant].box} px-4 py-3 text-ink ${className}`.trim()}
      {...rest}
    >
      <NoticeIcon kind={variant} />
      <Body className="min-w-0 flex-1">{children}</Body>
    </Tag>
  );
}
