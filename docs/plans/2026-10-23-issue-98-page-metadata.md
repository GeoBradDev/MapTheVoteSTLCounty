# Plan: Page metadata, link previews and noindex (issue #98)

Risk tier: Medium. Head tags change on every in-app navigation (stateful, across
pages), the shell and every pre-rendered page change, and `render.yaml` gets a new
header; no auth, money, data or outward messages.

Domain skills: superpowers:test-driven-development: invoke.
superpowers:verification-before-completion: invoke. vercel-react-best-practices: not
applicable because the only React change is a small effect hook with no rendering,
data fetching or bundle change. frontend-design: not applicable because no page UI
changes (the share image is drawn from the existing palette and mark).
chrome-devtools-mcp:a11y-debugging: not applicable because no visible UI changes.

Owner decisions (on the issue, 2026-10-23): precinct pages (`/p/<code>`, County and
City) get `noindex` and keep their link previews; one site-wide share image, 1200 x 630,
the site name and "Find where to vote" in the #76 deep teal palette, no election date.

What #99 already did: the pre-rendered public pages (`/`, `/learn`, each topic,
`/privacy`) carry their title, description, canonical and `og:type`, `og:site_name`,
`og:title`, `og:description`, `og:url`, and the app rewrites them on navigation
(`src/pageHead.js`, `App.jsx`'s `PageHead`). The description wording (#71) and the site
name (#93) have landed. The favicon (#79) and the manifest (#25) exist.

## Acceptance criteria

1. Every head (the shell and each pre-rendered page) has `og:image` as the absolute URL
   `https://mapthevotestl.com/share-image.png`, with `og:image:width` 1200,
   `og:image:height` 630 and `og:image:alt`, and `twitter:card` `summary_large_image`.
2. The shell (`shell.html`, served for `/p/<code>`, `/early-voting` and unknown paths)
   has the site name and description as `og:title` and `og:description`, `og:type`,
   `og:site_name` and the image tags, but no canonical and no `og:url`, so a pasted
   `/p/CC007` link previews with the site name, the description and the image.
3. The pre-rendered pages keep their own title, description, canonical and `og:url`,
   each tag once, with absolute `https://mapthevotestl.com` URLs, and the description on
   the home page says "nonpartisan" and "unofficial" and names St. Louis City and County.
4. On in-app navigation the head follows the page as before, the image and card tags
   included; no head tag on any route holds a query string, a hash, an address or
   coordinates.
5. `<meta name="robots" content="noindex">` is in the head while a precinct page
   (County or City code), the not-found page or the error screen is shown, and gone
   again after navigating to `/`. The PR preview build's own noindex tag is never
   removed by the app.
6. Precinct pages are also served with `X-Robots-Tag: noindex` (`render.yaml`'s `/p/*`
   rule, mirrored by `vite preview`), so crawlers that do not run JavaScript get it too.
   `/early-voting` stays indexable as it is today.
7. `public/share-image.png` is a 1200 x 630 PNG drawn by `scripts/draw-share-image.mjs`
   from the palette tokens and the site mark; nothing election-specific in it.
   `render.yaml` gives `/share-image.png` its own Cache-Control rule (no overlap).
8. `npm run test:perf` also runs Lighthouse's SEO category on every route it measures and
   fails when a run fails an SEO audit, except `is-crawlable` on `/p/*` (noindex by the
   owner's decision). No existing threshold changes.
9. The smoke test checks the `X-Robots-Tag` header on `/p/CC007` with the other header
   checks, and the docs (README Search engines, Deploy, Performance, Smoke test) match.

## Files that change

- `src/pageHead.js`: `headTags` adds the image and card tags to every head and the Open
  Graph tags to the shell head; `applyHead` manages `twitter:` tags too; `SHARE_IMAGE`.
- `index.html`: the shell's Open Graph and card tags, static (a test keeps them equal to
  `headTags(shellHead())`).
- `src/prerender/html.js`: strip every managed tag from the template (description,
  `og:*`, `twitter:*`) before writing the page's own.
- `src/components/useNoindex.js` (new): adds a marked robots noindex tag while the page
  is shown. Used in `NotFoundPage.jsx`, `ErrorBoundary.jsx` (`ErrorScreen`) and
  `src/features/lookup/PrecinctPage.jsx`.
- `src/i18n/en.json`: `site.shareImageAlt`, `site.shareImageTagline`.
- `public/share-image.png` (new), `scripts/draw-share-image.mjs` (new).
- `render.yaml`: `X-Robots-Tag` on `/p/*`, Cache-Control for `/share-image.png`.
- `src/prerender/plugin.js`: `previewHeaders` sends `X-Robots-Tag` on `/p/*`.
- `scripts/smoke.mjs`: a `/p/CC007` header table with `x-robots-tag`.
- `e2e/lighthouse.js`: SEO category and its gate.
- Tests: `src/pageHead.test.js`, `src/prerender/html.test.js`, `src/pageHeadApp.test.jsx`,
  `src/test/build.test.js`, `src/test/addressPrivacy.test.jsx`, `src/test/render.test.js`,
  `src/test/smoke.test.js`, `src/prerender/plugin.test.js`, new
  `src/test/shareImage.test.js`.
- `README.md`: Search engines, Deploy, Performance, Smoke test.

## Order of work

1. Tests then code for `headTags`/`applyHead` and `index.html`.
2. Tests then code for `renderPage` (template tags stripped), build test.
3. Tests then code for `useNoindex` and its three pages; addressPrivacy head check.
4. Share image script, PNG, test; `render.yaml` cache rule.
5. `X-Robots-Tag`: render.yaml, previewHeaders, smoke table, their tests.
6. Lighthouse SEO gate; run `npm run test:perf`.
7. README.

## Risks

- Duplicated tags on pre-rendered pages if the template's static tags are not stripped:
  covered by the build test counting each tag once.
- The app removing the PR preview's noindex: the hook removes only the element it added.
- LCP: the new tags are a few hundred bytes of head and the image is never fetched by the
  page; Lighthouse CI proves no regression. No JS added to the first load beyond a few
  lines (build budget test).
- SEO audits such as `link-text` may fail on existing pages; fix the cause in scope only
  if it is ours, otherwise stop and report.
- `X-Robots-Tag` shows only on production (PR previews keep the service's rules): checked
  by the smoke test after deploy.

Not done: per-precinct preview text (precinct pages are never pre-rendered); noindex on
`/early-voting` (not asked for; it stays as it is).

## Proof

- Criteria 1 to 3: `src/pageHead.test.js`, `src/prerender/html.test.js`,
  `src/test/build.test.js` (built shell and pages).
- Criteria 4 and 5: `src/pageHeadApp.test.jsx`, `src/test/addressPrivacy.test.jsx`.
- Criterion 6: `src/test/render.test.js`, `src/prerender/plugin.test.js`.
- Criterion 7: `src/test/shareImage.test.js`, `src/test/render.test.js`.
- Criterion 8: `npm run test:perf` output.
- Criterion 9: `src/test/smoke.test.js`.
- Live drive: build, `npm run preview`, curl `/p/CC007`, `/` and `/learn` for the tags
  and header; drive `/nope` and `/p/CC007` in a browser to see the noindex tag.
