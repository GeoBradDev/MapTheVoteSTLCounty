// The web app manifest (#25), linked from script well after the page has
// loaded. A manifest link in the HTML is fetched at once, beside the app's
// script, and the browser then fetches an icon too; on the Lighthouse runs that
// cost about 150 ms of LCP, and on a precinct page linking it at the load event
// still put both requests beside the page's data. Nothing needs it sooner:
// Chrome offers to install only after the voter has used the page a while, and
// iOS reads the page's links when Add to Home Screen is tapped (before the
// delay, it still gets the touch icon index.html links, and the page title).

export const MANIFEST_HREF = '/manifest.webmanifest';

/** How long after the load event the manifest is linked. */
export const MANIFEST_DELAY_MS = 10_000;

/**
 * Adds `<link rel="manifest">` to `doc`'s head `MANIFEST_DELAY_MS` after
 * `win`'s load event, at the next idle time. Adds at most one.
 * @param {Document} doc
 * @param {Window} win
 */
export function linkManifest(doc, win) {
  const add = () => {
    if (doc.head.querySelector('link[rel="manifest"]')) return;
    const link = doc.createElement('link');
    link.rel = 'manifest';
    link.href = MANIFEST_HREF;
    doc.head.append(link);
  };
  const later = () =>
    setTimeout(
      () => (win.requestIdleCallback ? win.requestIdleCallback(add) : add()),
      MANIFEST_DELAY_MS,
    );
  if (win.document.readyState === 'complete') later();
  else win.addEventListener('load', later, { once: true });
}
