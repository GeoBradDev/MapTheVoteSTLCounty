import { useEffect, useId, useRef, useState } from 'react';
import { shareUrl } from '../../config/site.js';
import { copy } from './resultsCopy.js';

/**
 * Shares the precinct's link: the share sheet where the browser has one, else
 * the clipboard, else a field to copy it from by hand. The link and the title
 * hold only the precinct code.
 * @param {{ code: string }} props A valid precinct code.
 */
export default function ShareLink({ code }) {
  const url = shareUrl(code);
  // null, 'copied' after the clipboard took the link, or 'manual' when it did not.
  const [outcome, setOutcome] = useState(null);
  const fieldRef = useRef(null);
  const fieldId = useId();

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
    <div className="mt-4">
      <button
        type="button"
        onClick={handleClick}
        className="min-h-11 rounded-md border border-border px-4 font-semibold text-primary"
      >
        {copy.share.button}
      </button>
      <p className="mt-1 text-muted">{copy.share.note(code)}</p>
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
