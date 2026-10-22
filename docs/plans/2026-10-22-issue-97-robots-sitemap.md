# Plan: robots.txt, a generated sitemap.xml, and no PR previews or onrender.com copy in search (issue #97)

Risk tier: Medium. A new build plugin, the Render Blueprint, the smoke test and the README
(more than a few files), and part of the behavior (Render serving the files, a preview
build seeing `IS_PULL_REQUEST`) only shows on a real deploy. No auth, money, data or
outward messages.

Domain skills: superpowers:test-driven-development, invoke. Frontend, React,
accessibility, dataviz skills: not applicable because no UI changes (one `<meta>` tag in
preview builds only). Django, FastAPI, Expo: not applicable because the repo is a static
Vite site.

Plan approval: given by the coordinator's brief for this batch run (the user launched it
to work #97 end to end).

## Acceptance criteria

1. `npm run build` writes `dist/robots.txt` (`User-agent: *`, `Allow: /`,
   `Sitemap: https://mapthevotestl.com/sitemap.xml`) and `dist/sitemap.xml`.
2. The sitemap is generated at build time from the routes and every English topic file
   under `content/` (no hand-written list): `/`, `/learn`, `/learn/<id>` for each topic,
   `/privacy`; absolute URLs from `siteUrl`; no `/p/` entry; valid XML in the
   `http://www.sitemaps.org/schemas/sitemap/0.9` namespace; `<lastmod>` only on topics,
   equal to the topic's `lastVerified`.
3. With `IS_PULL_REQUEST=true` the build writes a `robots.txt` of `User-agent: *` /
   `Disallow: /`, adds `<meta name="robots" content="noindex">` to `index.html`, and emits
   no sitemap. Without it (local, CI), the production files and no `noindex`.
4. `robots.txt` does not disallow `/p/` (the precinct page indexing choice is #98).
5. `render.yaml` has `Cache-Control: public, max-age=3600` rules for `/robots.txt` and
   `/sitemap.xml`; no two rules match one path; `src/test/render.test.js` checks it.
6. `scripts/smoke.mjs` checks `/robots.txt` returns 200 `text/plain` with the `Sitemap:`
   line and `/sitemap.xml` returns 200 with an XML content type and is not the app shell;
   with `--preview` it instead checks `/robots.txt` has `Disallow: /` and the shell has the
   `noindex` meta. `src/test/smoke.test.js` covers both.
7. `src/test/election-hardcoding.test.js` still passes, and the generated robots.txt and
   sitemap (lastmod dates aside, which are verification dates) name no election value.
8. README: a "Search engines" section (what is indexed and not and why, previews, the
   generated sitemap, the `onrender.com` finding, the Search Console and Bing steps), and
   the Deploy and Smoke test sections stay true.

Owner-only items left for the owner (follow-up issue): verifying the domain in Search
Console and Bing by DNS TXT record and submitting the sitemap; deciding whether to turn
off the `onrender.com` subdomain (`renderSubdomainPolicy: disabled`), which Render's docs
do not say is safe for PR previews, whose only address is an `onrender.com` one.

## Files that change

- `src/build/searchEngines.js` (new): `robotsTxt({ preview })`, `sitemapXml(topics)`,
  `readSitemapTopics(root)` (English topic files parsed with `parseTopic`), and the Vite
  plugin `searchEngines({ preview })` that emits the files in `generateBundle` and adds the
  meta tag in `transformIndexHtml`. `preview` defaults to
  `process.env.IS_PULL_REQUEST === 'true'`.
- `src/build/searchEngines.test.js` (new): unit tests plus real builds in both modes.
- `src/features/learn/content/vitePlugin.js`: export `topicFiles` for reuse.
- `vite.config.js`: register the plugin.
- `render.yaml`, `src/test/render.test.js`: the two Cache-Control rules.
- `scripts/smoke.mjs`, `src/test/smoke.test.js`: the robots and sitemap checks, `--preview`.
- `src/test/election-hardcoding.test.js`: check the generated files.
- `README.md`: Search engines section; Deploy (previews) and Smoke test lines.

## Order of work

1. Tests for `robotsTxt`, `sitemapXml`, the plugin in both modes (red), then the module.
2. Register the plugin; build-output test.
3. render.yaml rules and their test.
4. Smoke checks and their tests.
5. Election hardcoding check on the generated files.
6. README.

## Risks

- Render may not pass `IS_PULL_REQUEST` at static-site build time (its docs say default
  variables are available at build time unless noted). Then a preview looks like
  production: the smoke test with `--preview` against a preview shows it.
- A `Cache-Control` rule overlapping another: the overlap probe gains both paths.
- Smoke test against a preview without `--preview` fails the robots and sitemap checks by
  design; the README says to pass `--preview`.
- Topic ids must be URL-safe; `parseTopic` already limits them to lowercase words and
  hyphens.

## Proof

- Criteria 1 to 4: `src/build/searchEngines.test.js` (unit and real builds in both modes).
- Criterion 5: `src/test/render.test.js`.
- Criterion 6: `src/test/smoke.test.js` (stub hosts and the real build preview).
- Criterion 7: `src/test/election-hardcoding.test.js`.
- Live drive: `npm run build && npm run preview`, curl `/robots.txt`, `/sitemap.xml`, `/`;
  then `IS_PULL_REQUEST=true npm run build` and the same, plus `npm run smoke -- <url>
  --skip-headers` (and `--preview`).
