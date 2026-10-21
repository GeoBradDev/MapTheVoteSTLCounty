# Plan: Shareable lookup URLs that carry the precinct, never the address (issue #17)

Risk tier: Medium. Low base, raised one for interactive UI on browser APIs (`navigator.share`,
the clipboard) that unit tests can only stub; it also changes existing behavior (the not-found
screen, lowercase codes). No auth, money, data writes or outward messages. The orchestrator's
run instructions stand in for the Medium plan approval (autonomous batch run); noted in the PR.

Domain skills: vercel-react-best-practices: invoke (React components and effects).
chrome-devtools-mcp: invoke for the live drive. frontend-design: not applicable because the
change adds one small button and a note inside the existing card style. Django, FastAPI, Expo,
payments, email: not applicable because the app is a frontend-only React site.

## What already exists

- `/p/:precinct` (#11) loads the precinct by code with `getPrecinctById`, which validates the
  format first (`PRECINCT_CODE`, `^[A-Z]{2,3}\d{3}$`) and makes no request for a bad code.
- The lookup navigates to `/p/<code>` only; the point is held in memory (`lookupPoint.js`).
- `index.html`'s title is static and no code changes `document.title` or `history.state`.

## Acceptance criteria

1. The share URL is `https://mapthevotestl.com/p/<CODE>`: the production origin plus the path,
   nothing else (no query, hash, address text or coordinates).
2. A code that is valid apart from letter case or surrounding spaces (`/p/cc007`,
   `/p/Cc007`) replaces the URL with `/p/CC007` (history replace, not push) and shows that
   precinct. Fixes the #11 follow-up where lowercase codes showed "not found".
3. A malformed or unknown code shows the friendly not-found message, keeps the official lookup
   link, and shows the address search box (`AddressLookup`) and Use my location on the page.
4. Once the precinct loads, a "Share this page" button appears. With `navigator.share`, it calls
   it with `{ title, url }` only (no `text` with any address). Cancelling the share sheet
   (AbortError) shows nothing. Without `navigator.share`, or when it fails for another reason,
   it copies the URL with `navigator.clipboard.writeText` and shows a visible "Link copied"
   confirmation in a polite status region. If the clipboard is missing or fails, it shows the
   link in a read-only, selectable text field with a "Copy this link:" label.
5. Next to the button, on screen: the link opens this precinct's results and does not include
   the address.
6. `document.title` is `Precinct <CODE> | St. Louis County Voter Guide` for a valid code and
   goes back to the previous title when the page unmounts. It never holds address text.
7. After a full search (App, real routing, fake geocoder), the test address and its coordinates
   appear in none of: `window.location.href`, `document.title`, `history.state`, the share
   data passed to `navigator.share`, the copied text.
8. Opening `/p/<CODE>` fresh (no in-memory point) shows the same precinct, sample ballot and
   districts as the lookup did (true by construction; proven by the existing link test and the
   live drive in a fresh browser context).

## Files that change

- `src/config/site.js` (new): `siteUrl = 'https://mapthevotestl.com'` and
  `shareUrl(code)`. Not election-specific, so not in `election.js`.
- `src/features/lookup/ShareLink.jsx` (new): the button, note, confirmation and fallback field.
- `src/features/lookup/ShareLink.test.jsx` (new).
- `src/features/lookup/PrecinctPage.jsx`: case/space normalization redirect, title effect,
  `ShareLink` in the header once loaded, `AddressLookup` under the not-found message.
- `src/features/lookup/resultsCopy.js`: share and title copy.
- `src/features/lookup/PrecinctPage.test.jsx`: tests for criteria 2, 3, 6.
- `src/features/lookup/sharePrivacy.test.jsx` (new): end-to-end privacy test for criterion 7
  through `App` and the real browser location. (Planned for `src/App.test.jsx`, but that file
  never answers fetch, and this test needs the fixtures.)
- `README.md`: one line on share URLs using the production origin.

No new route, so `render.yaml` does not change.

## Order of work

1. TDD the lowercase redirect (a defect from #11: red test first, committed alone).
2. TDD `site.js` + `ShareLink` (navigator.share, AbortError, clipboard, manual fallback).
3. TDD title effect and not-found search box in `PrecinctPage`.
4. App-level privacy test.
5. README line. Gate: lint, format:check, test, build.

## Risks

- Redirect loop: the redirect only fires when the normalized code differs and matches the
  pattern; the target is already normalized, so it cannot fire twice.
- `navigator.share` exists on desktop browsers that then reject with `NotAllowedError`; that
  falls back to the clipboard rather than doing nothing.
- `AddressLookup` inside the precinct page: a search for the same precinct navigates to the
  same URL; wouter keeps the page mounted and the keyed results reload only on a code change.
  Acceptable because this only renders on the not-found screen, where the code is never valid
  for a found precinct.
- Dev and PR previews share the production URL, which is intended (a preview link would die).

## Proof

- Criterion 1, 4, 5: `ShareLink.test.jsx`.
- Criterion 2, 3, 6: `PrecinctPage.test.jsx`.
- Criterion 7: `sharePrivacy.test.jsx`.
- Criterion 8: existing "from a link" test plus live drive: search an address, click Share,
  open the copied path in a fresh browser context, compare heading, ballot link and districts;
  check `location.href`, `document.title`, `history.state` for the address. Also drive
  `/p/cc007`, `/p/ZZ999`, `/p/hello`.
