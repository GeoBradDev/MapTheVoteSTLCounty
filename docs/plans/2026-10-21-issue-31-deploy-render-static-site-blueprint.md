# Plan: Deploy as a Render static site using a render.yaml Blueprint (issue #31)

Risk tier: High. Forced: the change sets the site's security headers (Content-Security-Policy,
HSTS, Permissions-Policy). It also changes hosting behavior a unit test cannot fully
exercise (Render's CDN, rewrites and header matching are only observable after a deploy).

Domain skills:
- superpowers:test-driven-development: invoke.
- context7 / Render docs: invoke as a docs lookup. Every Blueprint key is checked against
  https://render.com/docs/blueprint-spec, https://render.com/docs/static-site-headers and
  https://render.com/docs/redirects-rewrites rather than memory.
- chrome-devtools-mcp (chrome-devtools): invoke for the live drive, to load the built app
  under the real CSP and read the console for violations.
- security-review: not invoked as a separate skill; the Phase 5 finders run a Security pass
  over the CSP and headers.
- vercel-react-best-practices, frontend-design: not applicable because no React code or UI
  changes.
- expo, django, django-ninja, fastapi, claude-api, dataviz: not applicable because none of
  those stacks are involved.

Mode: commit. The owner authorized commits, pushing this issue branch, the PR and its squash
merge for this run, and delegated plan approval for this run (owner decisions below).

Owner decisions (2026-10-21):
- Production custom domain: `mapthevotestl.com`, under `domains`. Render adds the `www`
  redirect.
- Frontend only: a single static site, no server, proxy or backend service.
- Geocoder (#7, later) is the public Photon API at `https://photon.komoot.io`, called from
  the browser. The CSP allows it now.
- Map tiles (#13) are not chosen. The CSP names no tile host; a comment says #13 must
  extend it.
- Dashboard and DNS steps are the owner's. Criteria that need a live deploy are listed as
  post-deploy checks; the PR says `Refs #31`.

## Findings that shape the config

- Render applies a rewrite only when no file exists at the path ("Render does not apply
  redirect or rewrite rules to a path if a resource exists at that path"), so the `/*` to
  `/index.html` rewrite does not catch `/assets/*`, `/sw.js` or icons. No narrowing needed.
- Render does not document what happens when two header rules with the same header name
  match one path. A community report shows `/*` winning over a more specific
  `/assets/icon/*`, and other hosts comma-join the values, which would turn
  `no-cache` plus `immutable` into a contradictory `Cache-Control`. So no two rules for
  the same header name may match the same path. `Cache-Control: no-cache` goes on the
  shell paths explicitly (`/`, `/index.html`, `/p/*`, `/learn`, `/learn/*`, `/sw.js`), and
  `immutable` only on `/assets/*`. Unknown paths (the in-app 404) get Render's default
  caching; noted as a post-deploy check.
- Blueprint headers cannot differ per preview, so `X-Robots-Tag: noindex` for previews
  only is not possible in `render.yaml`. Noted in the README and PR.
- The app fetches only `services6.arcgis.com` today (`src/data/arcgis.js`, origin from
  `election.serviceRoot`). `stlouiscovotes.maps.arcgis.com`, `stlouis-mo.gov`,
  `sos.mo.gov`, `revisor.mo.gov` and `stlouiscovotes.info` are link targets only
  (navigation is not governed by `connect-src`), so they are not in the CSP.
- The built `index.html` has no inline script or style, so `script-src 'self'` and
  `style-src 'self'` work with no `unsafe-inline`.

## Acceptance criteria

1. `render.yaml` at the repo root defines exactly one service: `type: web`,
   `runtime: static`, `name`, `branch: main`, `buildCommand: npm ci && npm run build`,
   `staticPublishPath: ./dist` (Vite's output dir), `autoDeployTrigger: checksPass`,
   `previews.generation: automatic`, `buildFilter.ignoredPaths` for `docs/**` and
   `README.md` (not `**/*.md`: Markdown under `content/` ships, per #21; review finding), `domains: [mapthevotestl.com]`. No `startCommand`, `region`, `plan`, or other
   service.
2. `routes` is one rewrite, `/*` to `/index.html`.
3. Headers on every shell path (`/`, `/index.html`, `/p/CC007`, `/learn`, `/learn/voter-id`):
   `Referrer-Policy: no-referrer`, `X-Content-Type-Options: nosniff`,
   `Permissions-Policy: geolocation=(self), camera=(), microphone=()`, an enforced
   `Content-Security-Policy`, `Strict-Transport-Security`, and `Cache-Control: no-cache`.
   `/sw.js` also gets `no-cache`. A hashed asset gets
   `Cache-Control: public, max-age=31536000, immutable`.
4. No two header rules with the same header name match the same path.
5. The CSP: `default-src 'self'`; `script-src 'self'`, `style-src 'self'` (no
   `unsafe-inline` or `unsafe-eval`); `connect-src 'self'` plus the origin of
   `election.serviceRoot` and `https://photon.komoot.io`; `img-src 'self'`; `font-src 'self'`;
   `manifest-src 'self'` (explicit, for #25 and #13 to extend);
   `object-src 'none'`; `base-uri 'self'`; `form-action 'self'`;
   `frame-ancestors 'none'`; `upgrade-insecure-requests`. A YAML comment says #13 must add
   its tile, style and font hosts and `worker-src blob:` / `child-src blob:` for MapLibre.
6. The headers `render.yaml` sends on `/`, `/p/CC007` and a hashed asset pass the smoke
   test's own header tables (`scripts/smoke.mjs`), so the two cannot drift.
7. The built `index.html` has no inline script, inline style element or style attribute.
8. `.node-version` pins Node to the local version, `24.18.0`; CI reads it with
   `node-version-file`; `render.yaml` sets no `NODE_VERSION`.
9. README has a Deploy section: how the Blueprint works, the owner's one-time setup,
   rollback in the Dashboard, that Dashboard edits to headers or routes are overwritten on
   the next sync and `buildFilter` is fully replaced, the CSP rule for new origins, and the
   preview `noindex` limitation.
10. No GitHub Pages workflow or hash routing exists to remove (verified: only `ci.yml`;
    wouter path routing).
11. A local server that applies `render.yaml`'s headers and rewrite to `dist/` passes
    `npm run smoke` with headers, and the app loads there in Chrome with no CSP violation.

Post-deploy, verifiable only after the owner creates the Blueprint (not met by this run):
merge to `main` with green CI deploys; PR previews get URLs; hard reload of `/p/CC007` on
the live site; `curl -I` shows the headers; securityheaders.com grade; Render's own
caching does not override ours; unknown-path caching; `npm run smoke` passes against a PR
preview and against production (deferred here by #3, criterion 8); the app loads with no
CSP errors in the console; "Use my location" works on a real iPhone (Safari) and Android
phone (Chrome) on the HTTPS site (deferred here by #9); `npm ci` on Render installs the
dev dependencies the build needs; the first Blueprint sync accepts the `/` header path.

## Files that change

- `render.yaml` (new).
- `.node-version` (new).
- `.github/workflows/ci.yml`: `node-version-file: .node-version`; comment now refers to
  render.yaml as present.
- `package.json`, `package-lock.json`: add `yaml` dev dependency (parse render.yaml in
  tests).
- `scripts/smoke.mjs`: export `SHELL_HEADERS` and `ASSET_HEADERS`.
- `src/test/render.test.js` (new): criteria 1 to 6 and 8.
- `src/test/build.test.js`: criterion 7.
- `README.md`: Deploy section; Node line points at `.node-version`; smoke section notes
  the render.yaml check.
- `src/test/smoke.test.js`: comment names render.yaml instead of #31.

## Order of work

1. Add `yaml`; write `src/test/render.test.js` and the build test; run them red (no
   render.yaml, no .node-version).
2. Add `render.yaml`, `.node-version`, the CI change and the smoke exports; run green.
3. README.
4. Full gate, then the live drive with a scratch server.

## Risks

- A wrong CSP blocks the app in production. Mitigation: the live drive loads the real build
  under the exact policy; the PR asks the owner to watch the console on the first preview.
- Header path `/` might be rejected or not matched by Render. Mitigation: `/index.html` is
  listed too; the smoke test on the first preview catches a gap.
- `checksPass` deploys depend on CI reporting on `main`; it does (`push: branches: [main]`).
- Riskiest step: Cache-Control overlap (criterion 4), because the failure (a stale shell on
  Election Day) is silent. The overlap test guards it.
- Chose not to: add a committed local Render emulator, add per-preview noindex, or use
  Report-Only (enforced now, since the app's origins are known and the drive proves it).

## Proof

- `src/test/render.test.js`: criteria 1, 2, 3, 4, 5, 6, 8.
- `src/test/build.test.js`: criterion 7.
- Live drive (scratch server applying render.yaml): `npm run smoke -- <local url>` passes
  all checks with headers; Chrome loads `/`, `/p/CC007`, `/learn/voter-id` and an unknown
  path with no CSP console errors; `/assets/*` is not rewritten; an ArcGIS fetch from the
  page is allowed and a fetch to an unlisted origin is blocked.
