# Plan: CSP allows the Google Analytics hosts only when a measurement ID is set (issue #191)

Risk tier: High. It changes the production Content-Security-Policy (a security control), forced
High by the skill's rules; the change itself is small and fully unit testable. The approach is
the owner's decision on the issue (2026-10-24), so it is not re-asked.

Domain skills: superpowers:test-driven-development, invoke. Frontend, accessibility, data and
React skills: not applicable because no UI, data or bundle code changes (the new helper is not
imported by the app, so first-load JS is unchanged).

## Acceptance criteria

1. With `gaMeasurementId` empty in `src/config/site.js`, the production CSP in `render.yaml`
   names no Google host in any directive (`script-src`, `connect-src`, `img-src`).
2. A test checks that the CSP and the ID agree: no Google hosts with an empty ID; all of them
   (`script-src` the loader, `connect-src` the loader and the collector, `img-src` the collector)
   with an ID set. It passes as shipped.
3. Given a test ID and a CSP without the hosts, the check fails with a message naming exactly
   which source to add to which directive; given an empty ID and a CSP with them, it names which
   to remove.
4. `src/test/render.test.js`, `src/features/privacy/PrivacyPage.test.jsx` and
   `scripts/smoke.mjs` no longer pin the Google hosts into the shipped policy; the smoke
   script's live header check fails when the live CSP and the ID disagree.
5. README: the GA setup checklist says to set the ID and add the CSP hosts in the same change,
   and keeps enhanced measurement's outbound clicks off, noting directions links carry
   coordinates in their URLs. The README's privacy text and the `render.yaml` comment above the
   CSP describe the new state.
6. `e2e/analytics.e2e.js` still runs unchanged in what it proves (its build is served by
   `vite preview`, which sends no CSP, so the stricter production CSP does not affect it).

## Files that change

- `src/analytics/csp.js` (new): `ANALYTICS_CSP` (directive to required sources, from
  `ANALYTICS_HOSTS`) and `analyticsCspProblems(policy, measurementId)`, returning a list of
  plain-language problems, empty when they agree. Not imported by app code.
- `src/analytics/csp.test.js` (new): unit cases for the helper (both states, both mismatch
  directions, message text) and the agreement check against the real `render.yaml` and ID.
- `render.yaml`: remove the Google sources; rewrite the GA comment above the CSP.
- `src/test/render.test.js`: the reviewed policy is the base policy plus `ANALYTICS_CSP` only
  when the ID is set; the host wildcard test allows the collector only when the ID is set.
- `src/features/privacy/PrivacyPage.test.jsx`: drop the requirement that the CSP contains the
  analytics hosts (still skip them when naming, so the test holds in both states).
- `scripts/smoke.mjs`: the live CSP check also requires `analyticsCspProblems` to be empty.
- `src/test/smoke.test.js`: a case for a live CSP naming Google hosts while the ID is empty.
- `src/analytics/index.js`: comment about script-src.
- `README.md`: Privacy paragraph, GA checklist steps 2 and 5.

Review revision (finder 1): the ID counts as set only when GA would load with it
(`analyticsEnabled`, a GA4 `G-` ID), so a malformed ID never forces the Google hosts into the
policy; with the ID set, the first copy of a repeated directive is the one checked (the one a
browser enforces); and the Google host pattern also covers country domains, the ad and static
domains and a trailing dot, for the live smoke check.

Review revision (finder 2): with the ID empty, a source that allows any host (`*`, `https:`,
`http:`) also counts as allowing Google, and `googletagservices.com` is in the host pattern;
the stale comment in `src/features/privacy/privacyCopy.js` is corrected.

Review revision (finder 3): any-host sources also cover `https://*`, `*:*` and a top-level
domain wildcard (`*.com`), not `data:` or `blob:`; with the ID set, each GA request is checked
against the directive a browser applies (`script-src-elem` over `script-src`, `default-src`
when one is left out), and the message names that directive; the README's pre-election check
also confirms no outbound `click` hit for a directions link.

Review revision (finder 4): with the ID empty, each source is parsed (scheme, host, port, path)
and a wildcard host is tried against one sample host per Google domain, so a wildcard with a
path (`https://*/gtag/js`) or over a two-label suffix (`*.co.uk`) is caught; the Google domains
also include `googleapis.com` and `googleusercontent.com`.

## Order of work

1. Red: write `src/analytics/csp.test.js` (helper does not exist) and confirm it fails.
2. Implement `src/analytics/csp.js`; unit cases pass, the agreement case fails on the current
   `render.yaml`.
3. Edit `render.yaml`; agreement case passes; `render.test.js` and `PrivacyPage.test.jsx` fail
   on their pinned hosts; update them.
4. Smoke script and its test.
5. Comments and README.
6. Full gate.

## Risks

- A test that hard-codes the shipped state would break the day the owner sets the ID; every
  test here derives the expected policy from the ID so setting it plus adding the hosts is the
  only change needed.
- The smoke check against the live site now fails while the deployed CSP still has the hosts
  (before this deploys). Expected; it passes after deploy.
- Not done: giving the analytics e2e its own CSP. `vite preview` sends no CSP for any spec, so
  this would be a new e2e capability, not part of this issue.

## Proof

- Criteria 1 to 3: `src/analytics/csp.test.js`.
- Criterion 4: `src/test/render.test.js`, `src/features/privacy/PrivacyPage.test.jsx`,
  `src/test/smoke.test.js`.
- Criterion 6: `npm run test:e2e` (analytics spec green).
- Live drive: build and preview, run `npm run smoke -- http://localhost:4173 --skip-headers`,
  and run the helper against `render.yaml` with a test ID to show the message.
