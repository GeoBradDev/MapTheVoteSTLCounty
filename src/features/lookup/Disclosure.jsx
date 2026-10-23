import { useState } from 'react';

/**
 * A native disclosure: a summary line that shows or hides what follows, with
 * a 44 px tap target. Local to the results page until the shared components
 * (#78) take it over.
 * @param {{ summary: import('react').ReactNode, defaultOpen?: boolean,
 *   className?: string, children: import('react').ReactNode }} props
 *   `defaultOpen` is read once: the voter's own toggle wins after that.
 */
export default function Disclosure({ summary, defaultOpen = false, className, children }) {
  // React sets `open` only when the prop changes, so the voter's toggle stays.
  const [open] = useState(defaultOpen);
  return (
    <details open={open || undefined} className={className}>
      <summary className="min-h-11 cursor-pointer py-2 font-semibold text-primary">
        {summary}
      </summary>
      {children}
    </details>
  );
}
