import { useEffect, useId, useRef, useState } from 'react';
import { shareUrl } from '../../config/site.js';
import { copy } from './resultsCopy.js';

// A share arrow, drawn in the text color. Decoration only.
function ShareIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 16 16" className="size-4" fill="currentColor">
      <path d="M8 1a1 1 0 0 1 .7.3l3 3a1 1 0 0 1-1.4 1.4L9 4.4V10a1 1 0 1 1-2 0V4.4L5.7 5.7a1 1 0 0 1-1.4-1.4l3-3A1 1 0 0 1 8 1ZM3 9a1 1 0 0 1 1 1v3h8v-3a1 1 0 1 1 2 0v3a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2v-3a1 1 0 0 1 1-1Z" />
    </svg>
  );
}

/**
 * Shares the precinct's link: the share sheet where the browser has one, else
 * the clipboard, else a field to copy it from by hand. The link and the title
 * hold only the precinct code.
 * A quiet button in the page header (#81), after `children` (the header's
 * other links) on the same row, with the privacy note as its help text.
 * @param {{ code: string, children?: import('react').ReactNode }} props
 *   `code` is a valid precinct code.
 */
export default function ShareLink({ code, children }) {
  const url = shareUrl(code);
  // null, 'copied' after the clipboard took the link, or 'manual' when it did not.
  const [outcome, setOutcome] = useState(null);
  const fieldRef = useRef(null);
  const fieldId = useId();
  const noteId = useId();

  useEffect(() => {
    // Focus selects the link (onFocus), ready to copy.
    if (outcome === 'manual') fieldRef.current?.focus();
  }, [outcome]);

  // A share sheet already open, so a second press does not open another.
  const sharingRef = useRef(false);

  async function handleClick() {
    if (sharingRef.current) return;
    setOutcome(null);
    if (typeof navigator.share === 'function') {
      sharingRef.current = true;
      try {
        await navigator.share({ title: copy.share.title(code), url });
        return;
      } catch (error) {
        // The voter closed the share sheet.
        if (error?.name === 'AbortError') return;
        // Anything else (no permission, nothing to share to): copy instead.
      } finally {
        sharingRef.current = false;
      }
    }
    try {
      await navigator.clipboard.writeText(url);
      setOutcome('copied');
    } catch {
      setOutcome('manual');
    }
  }

  return (
    <div className="mt-2">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
        {children}
        <button
          type="button"
          onClick={handleClick}
          aria-label={copy.share.button}
          aria-describedby={noteId}
          className="inline-flex min-h-11 items-center gap-2 rounded-md border border-border px-3 text-sm font-semibold text-primary"
        >
          <ShareIcon />
          {copy.share.short}
        </button>
      </div>
      <p id={noteId} className="mt-1 text-xs text-muted">
        {copy.share.note(code)}
      </p>
      <p role="status" className="mt-1 font-semibold">
        {outcome === 'copied' ? copy.share.copied : ''}
      </p>
      {outcome === 'manual' && (
        <div className="mt-2">
          <label htmlFor={fieldId} className="block">
            {copy.share.manual}
          </label>
          <input
            ref={fieldRef}
            id={fieldId}
            type="text"
            readOnly
            value={url}
            onFocus={(event) => event.target.select()}
            className="mt-1 min-h-11 w-full rounded-md border border-ink bg-surface px-3 py-2 text-base text-ink"
          />
        </div>
      )}
    </div>
  );
}
