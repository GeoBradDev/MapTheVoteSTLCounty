import { useEffect, useRef, useState } from 'react';

/**
 * A native disclosure: a summary line that shows or hides what follows, with
 * a 44 px tap target, for secondary detail such as long hour lists and source
 * notes (#81, #78). It opens for printing and folds back after, as the topic
 * pages' sections do, so a printed page holds everything.
 * @param {{ summary: import('react').ReactNode, defaultOpen?: boolean,
 *   className?: string, children: import('react').ReactNode }} props
 *   `defaultOpen` is read once: the voter's own toggle wins after that.
 */
export default function Disclosure({ summary, defaultOpen = false, className, children }) {
  // React sets `open` only when the prop changes, so the voter's toggle stays.
  const [open] = useState(defaultOpen);
  const ref = useRef(null);

  useEffect(() => {
    let openedForPrint = false;
    const beforePrint = () => {
      const details = ref.current;
      if (!details || details.open) return;
      details.open = true;
      openedForPrint = true;
    };
    const afterPrint = () => {
      if (openedForPrint && ref.current) ref.current.open = false;
      openedForPrint = false;
    };
    window.addEventListener('beforeprint', beforePrint);
    window.addEventListener('afterprint', afterPrint);
    return () => {
      window.removeEventListener('beforeprint', beforePrint);
      window.removeEventListener('afterprint', afterPrint);
    };
  }, []);

  return (
    <details ref={ref} open={open || undefined} className={className}>
      <summary className="min-h-11 cursor-pointer py-2 font-semibold text-primary">
        {summary}
      </summary>
      {children}
    </details>
  );
}
