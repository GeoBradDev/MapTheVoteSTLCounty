# Plan: ArcGIS data client: precinct lookup, polling places, caching, and timeouts (issue #5)

Risk tier: Medium. Not a forced-High area (no auth, money, migrations, scheduled jobs or
outward messages). Starts Low and rises one tier for async behavior: timeouts, abort, retry
with backoff and a shared in-memory promise cache. Unit tests with fake timers and a stubbed
`fetch` can exercise all of it, it adds a module rather than altering one, and it touches a
handful of files, so no further raise.

Domain skills:
- vercel-react-best-practices: not applicable because no React code changes; nothing calls
  the client yet.
- frontend-design, dataviz: not applicable because there is no UI or chart.
- context7 (docs lookup): not applicable because the client uses only `fetch`,
  `AbortController`, `URLSearchParams` and vitest APIs the repo already uses (fake timers,
  `vi.stubGlobal`); the ArcGIS REST parameters were checked live against the real layers.
- expo, django, django-ninja, fastapi, claude-api: not applicable because none of those
  stacks are involved.

Mode: commit. The `CLAUDE.md` git exception (commit 8a86939) is on the pushed
`docs-claude-md-git-exception` branch, not yet on `main`. The user approved treating it as
granted for this run on 2026-10-21: commits and pushes on this issue branch only, and the PR.

Scope decisions (made in Phase 1):
- The service worker copy of the polls is #25's job (Workbox runtime caching by URL). Here
  `getPolls` only has to request one stable URL, built the same way every time, so #25 can
  match it. No service worker code in this change.
- Parsing the sample ballot link out of `html` is #6. The client returns `html` trimmed and
  otherwise untouched.
- User-facing error messages are #18. This change only supplies the typed errors.
- Field names are passed through as the layer names them (`precinct`, `in_election`,
  `loc`, ...). No renaming, so `docs/data.md` stays the field reference.
- A malformed precinct code throws `NotFound` without a request: no precinct can have that
  code. Non-numeric coordinates throw `TypeError` without a request: that is a caller bug,
  and it is the guard that keeps address text from ever reaching a query.
- Fixtures are recorded from the live layers into `docs/raw/fixtures/` by a new script,
  `scripts/record-fixtures.mjs`, which reads the layer paths from the election config so it
  works again next election. `docs/raw` is already outside lint, Prettier and the
  hardcoding scan.

## Acceptance criteria

1. `src/data/arcgis.js` exports `getPrecinctAtPoint`, `getPrecinctById`, `getPolls`,
   `getPrecinctGeometry`, the error classes `TimeoutError`, `ServiceError` and `NotFound`
   (each an `Error` subclass with a matching `name`), `PRECINCT_CODE`
   (`/^[A-Z]{2,3}\d{3}$/`), and the timing constants `TIMEOUT_MS` and `RETRY_DELAY_MS`. All URLs come from `election.serviceRoot` and `election.layers`;
   no layer or service name is written in `src/data/`.
2. `getPrecinctAtPoint({ lat, lng })` sends a GET to the precincts layer's `query` with exactly
   `geometry=<lng>,<lat>`, `geometryType=esriGeometryPoint`, `inSR=4326`,
   `spatialRel=esriSpatialRelIntersects`, `outFields=*`, `returnGeometry=false`, `f=json`,
   and resolves to the first feature's normalized attributes, or `null` when there is no
   feature (outside the county). A nonresidential precinct resolves like any other, with its
   `in_election` and `html` values intact. `lat` or `lng` that is not a finite number throws
   `TypeError` and sends nothing.
3. `getPrecinctById(code)` checks `code` against `PRECINCT_CODE` before building the query;
   a failing code, including any value that is not a string, rejects with `NotFound` and
   sends nothing. A valid code sends
   `where=precinct='<code>'`, `outFields=*`, `returnGeometry=false`, `f=json`, and resolves
   to the normalized attributes, or rejects with `NotFound` when no feature matches.
4. `getPolls()` requests the polls layer once as GeoJSON (`where=1=1`, `outFields=*`,
   `outSR=4326`, `f=geojson`) and resolves to a FeatureCollection whose properties are
   normalized. Later calls, including concurrent ones, share the one request. A failed
   request is not cached: the next call fetches again.
5. `getPrecinctGeometry(code)` validates the code the same way, then requests
   `where=precinct='<code>'`, `outFields=precinct`, `returnGeometry=true`, `outSR=4326`,
   `maxAllowableOffset=0.0001` (degrees, about 10 m), `f=geojson`, and resolves to the first
   GeoJSON Feature, or rejects with `NotFound`.
6. Normalization, applied to precinct attributes and poll properties alike: strings are
   trimmed; `""`, whitespace-only strings and `null` become `null`; `loc` is a 3-digit
   zero-padded string even when the source gives a number or a shorter string. Other
   values pass through.
7. An HTTP 200 response whose body is `{ error: { code, message } }` rejects with
   `ServiceError` carrying `code` and `message`. A non-2xx response or a network failure
   also rejects with `ServiceError` (with `status` for HTTP errors), as does a 200 body that
   is not JSON or has no `features` array (added in Phase 4: without it such a body crashed
   with a bare `TypeError`), or a feature without its fields object: `attributes` for
   `f=json`, `properties` for `f=geojson` (added in Phase 5: such a polls body was cached as
   a rejection for the page load).
8. Each request aborts after 8 s with `AbortController` and rejects with `TimeoutError`.
   A timeout, a network failure, an HTTP 5xx or 429, or an ArcGIS error code 5xx or 429 is
   retried once after a backoff of 500 ms; any other error is not retried. A connection that
   drops while the body downloads is a network failure; only a body that fails to parse
   (`SyntaxError`) is a non-retried bad body. After the retry
   fails, its error is the one thrown.
9. Tests use fixtures recorded from the live layers and cover: found, not found (outside the
   county), nonresidential, an ArcGIS error body, and a timeout; plus by-ID, polls,
   geometry, normalization, retry and caching.
10. No address text is ever sent to ArcGIS: every request's query string carries only the
    parameters listed above, with coordinates or a validated precinct code as the only
    caller-derived values. A test checks the full parameter set of every request.
11. `npm run lint`, `npm run format:check`, `npm test` and `npm run build` pass.

## Files that change

- `src/data/arcgis.js` (new): the client.
- `src/data/arcgis.test.js` (new): unit tests, `@vitest-environment node`, fixtures imported
  from `docs/raw/fixtures/`.
- `scripts/record-fixtures.mjs` (new): records the fixtures below from the live layers.
- `docs/raw/fixtures/` (new, recorded, not hand-edited):
  - `precinct-at-point.json`: point query at `-90.33,38.62` (a voting precinct, HAD023).
  - `precinct-at-point-outside.json`: point query in St. Louis City (`-90.20,38.63`), no
    features.
  - `precinct-by-id.json`: `where=precinct='CC007'`.
  - `precinct-nonresidential.json`: `where=precinct='AP200'` (a nonresidential precinct).
  - `precinct-geometry.json`: CC007 GeoJSON with the offset above.
  - `polls.json`: all polling places as GeoJSON (85 KB on the wire, about 130 KB pretty-printed).
  - `error-body.json`: a query with an invalid field, which returns HTTP 200 with an error
    body.
- `src/data/.gitkeep`: removed, the directory now has files.
- `docs/data.md`: Phase 8, only where the change makes it wrong (the polls GeoJSON size is
  about 85 KB with all fields, not 30 KB) and a line pointing at the client and fixtures.

## Order of work

1. Write `scripts/record-fixtures.mjs` and record the fixtures. Check each by eye.
2. TDD, one behavior at a time, red then green: request building and the address guard;
   `getPrecinctAtPoint` found, outside, nonresidential; `getPrecinctById` valid, invalid,
   missing; normalization; error body and HTTP errors; timeout; retry rules; `getPolls`
   and its cache; `getPrecinctGeometry`.
3. Run the full gate. Live drive: run the client in Node against the real layers for the
   same cases (found, outside, nonresidential, by ID, polls count 200, geometry), and a
   forced timeout.
4. Phase 8 docs.

## Risks

- Timeout plus retry makes the worst case about 16.5 s before the UI hears anything. The
  UI (#18) has to show a pending state meanwhile. Accepted: the issue asks for both.
- A point exactly on a precinct boundary can return two features. The client returns the
  first; ArcGIS ordering is stable by `OBJECTID`, so the answer is consistent if arbitrary.
- `outFields=*` on the polls includes internal fields (`username`, `notes`, `absentee`). They
  are not shown by anyone today; trimming the field list is left to whoever builds the
  cards, since naming fields here would be a second place to update per election.
- The fixtures are a snapshot: if the county edits the layer before the election, tests still
  pass on old data. `scripts/record-fixtures.mjs` re-records them; #28 is the live health
  check.
- Fake timers and `AbortController`: the stubbed `fetch` must reject with an `AbortError`
  when its signal aborts, as real `fetch` does, or the timeout test proves nothing.
- Riskiest step: the retry/timeout interaction (a timer left running after success would
  abort nothing but leak; a retry after a non-retryable error would double requests). Both
  have tests asserting the request count.
- The polls are cached for the page load, so the `inline` line count, which fills only on
  Election Day, goes stale in a tab left open. Refreshing it belongs to #24 and #25.
- Not done: a caller-supplied `AbortSignal`, persistent caching, PBF, and a precinct cache.
  None are asked for.

## Proof

| Criterion | Test or check |
|---|---|
| 1 | test: exports and error classes; hardcoding test (`src/test/election-hardcoding.test.js`) stays green |
| 2 | tests: found (HAD023 fixture), outside (empty fixture returns `null`), nonresidential (AP200 fixture), non-finite coordinates throw with no fetch |
| 3 | tests: by ID (CC007 fixture), invalid codes (`cc007`, `CC07`, `CC007' OR 1=1`) reject with no fetch, empty result rejects `NotFound` |
| 4 | tests: polls normalized, one request for two concurrent calls, refetch after a failure |
| 5 | test: geometry fixture returns a Polygon Feature with the offset parameter sent |
| 6 | tests: padded `inline` and `notes_abs` become `null` or trimmed text, `loc` padded |
| 7 | tests: error-body fixture, HTTP 500, network failure |
| 8 | tests with fake timers: timeout rejects `TimeoutError` after 8 s; retry once on timeout and 5xx; no retry on ArcGIS 400 |
| 9 | the tests above |
| 10 | test: the full parameter set of each function's request equals the allowlist |
| 11 | the gate output |

Live drive must show: each function against the real layers returning the same shapes the
fixtures produce, `getPolls` returning 200 features, and a timeout (real `fetch` wrapped so
it never answers until aborted) rejecting with `TimeoutError` after two 8 s attempts.
