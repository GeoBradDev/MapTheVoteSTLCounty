// The site's mark (#79): a ballot with a check going into a ballot box. Drawn
// in currentColor, so it takes the text color around it (no red or blue), and
// hidden from screen readers: the site name next to it says what it is.
// public/favicon.svg draws the same shapes.
export default function SiteMark({ className }) {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden="true"
      focusable="false"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <path d="M7 12V3h10v9" />
      <path d="m9.5 7.5 2 2 3-3.5" />
      <path d="M3 12h18v8a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1z" />
    </svg>
  );
}
