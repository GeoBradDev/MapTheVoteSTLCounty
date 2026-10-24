# Plan: Google Analytics events for lookup outcomes and key actions (issue #70)

Risk tier: High. It sends new data to a third party (Google Analytics), so a mistake is a
privacy defect, and it wires click handlers into a dozen components (interaction, many
files). Mitigated by GA shipping off (empty ID, #69): nothing is sent until the owner sets
the ID.

Domain skills: superpowers:test-driven-development: invoke.
superpowers:verification-before-completion: invoke. vercel-react-best-practices: invoke
(handlers in components; the first-load budget). frontend-design: not applicable because
no UI changes. chrome-devtools-mcp:a11y-debugging: not applicable because no markup,
focus or text a voter sees changes (only the privacy notice's text, while GA is on).

Plan approval: run by the coordinator's brief for #70 (no interactive owner gate in this
run); the coordinator's privacy limits below are the approved scope.

## Constraints (coordinator's note for #70)

- Cookieless, as #69. Never an address, coordinates, precinct code, polling place or site
  name, ward, district, distance, URL, typed text, or fine timing. Outcome-only labels from
  a fixed allowlist.
- Components call only `track()` from `src/analytics/index.js`.
- First-load JS stays under 120 KB gzipped, about 1 KB headroom: the allowlist lives in the
  lazily loaded `ga.js`; `index.js` only queues `[name, params]` until ga.js is in, and does
  nothing while GA is off. No budget changes. No CSP change. No `docs/progress.md` edit.
- No `jurisdiction` parameter on any event: not needed for these questions. The
  `no_precinct` and `city_referral` outcomes still tell County or City for a lookup that found
  no precinct, so the notice says so (final review finder).
- No "wait map opened" event: not clearly needed for the issue's questions (noted in the PR).

## Events (the allowlist, `EVENTS` in `src/analytics/ga.js`)

| Event | Parameters |
| --- | --- |
| `lookup_result` | `source`: `address`, `location`; `outcome`: `precinct`, `no_precinct`, `city_referral`, `out_of_area`, `no_match`, `unavailable`, `failed`, `offline`, `denied`, `timeout`, `coarse` |
| `sample_ballot_open` | none |
| `directions_open` | `card`: `polls`, `early_voting`, `wait_times`; `provider`: `google`, `apple` |
| `official_lookup_open` | `card`: `polls`, `early_voting`, `sample_ballot`, `districts`, `lookup_error`, `precinct_error`, `wait_times`, `error_screen`, `referral`, `status` |
| `share` | `method`: `share_sheet`, `clipboard`, `manual` |
| `retry` | `where`: `lookup`, `precinct`, `polls`, `early_voting`, `districts`, `wait_times` |

Outcome kinds mapped in one place, `src/features/lookup/lookupOutcome.js`:
locate() `precinct` -> `precinct` (County or City); `county-unmatched` -> `no_precinct`;
`stl-city` (City referral, #88) -> `city_referral`; `missouri`, `out-of-state`, `unknown` ->
`out_of_area`; lookup errors `noMatch` -> `no_match`, `unavailable`, `failed`, `offline` as
named; device errors `denied`, `timeout`, `coarse` as named, `unavailable`, `insecure`,
`unsupported` -> `unavailable`. Anything else -> no event (dropped by the allowlist too).
A superseded, cancelled or edited-away lookup sends nothing.

## Acceptance criteria

1. `track(name, params)` in `src/analytics/index.js` is the only event API; it does nothing
   while GA is off; it queues until ga.js loads; ga.js sends `gtag('event', name, clean)`
   where `clean` keeps only allowlisted parameter names with allowlisted string values. An
   unknown event is not sent; an unknown parameter or value is dropped. Allowed ones pass
   through unchanged. `track` never throws.
2. Each event in the table fires from its component on the action described in the issue,
   with exactly its parameters, for County and City cards alike. Clicks never call
   `preventDefault` and never wait: the link navigates as before.
3. With GA forced on, a typed lookup and Use my location send no address, address part,
   coordinates or precinct code in any dataLayer entry (extends #69's privacy test).
4. The e2e analytics spec presses the sample ballot, a directions link and Share; their
   events are in the dataLayer with only allowed parameters, and nothing sent carries the
   code, coordinates or a URL; the links' clicks were not default-prevented by the app.
5. The privacy notice (shown only while GA is on) says it also counts which buttons and
   links are used and whether a search found a precinct, without what was searched or where.
   README lists the events and the rule that a new event goes through the allowlist and the
   notice in the same change. The PR template's privacy checkbox covers "or add an analytics
   event".
6. The full gate passes: lint, format, unit tests (first-load budget included), build,
   e2e, Lighthouse.

## Files that change

- `src/analytics/index.js`: `track()`; the session queue holds page views and events.
- `src/analytics/ga.js`: `EVENTS`, `eventParams()`, `startGa` returns `{ page, event }`.
- `src/analytics/index.test.js`: track tests.
- `src/features/lookup/lookupOutcome.js` (new) and its test.
- `src/features/lookup/AddressLookup.jsx`: `lookup_result` for both sources; source kept for
  Try again; `official_lookup_open` (`lookup_error`) via `OfficialLookups card`.
- `src/features/lookup/UseMyLocation.jsx`: `lookup_result` on a device failure.
- `src/components/OfficialLookups.jsx`: `card` prop, tracks on click.
- `src/features/lookup/RetryButton.jsx`: `where` prop, tracks `retry` on a press that runs.
- `src/features/lookup/SampleBallotCard.jsx`, `CitySampleBallotCard.jsx`: `sample_ballot_open`;
  the County card's missing-ballot lookup link: `official_lookup_open` `sample_ballot`.
- `src/features/lookup/PollsCard.jsx`: `OfficialLookupLink card`, directions, retry `polls`.
- `src/features/lookup/EarlyVotingCard.jsx` (County and City share `EarlyVotingSites`):
  directions, lookup link, retry `early_voting`.
- `src/features/lookup/ResultsSummary.jsx`: the summary's directions buttons, `card` by place.
- `src/features/lookup/DistrictsCard.jsx`, `CityDistrictsCard.jsx`: lookup link, retry `districts`.
- `src/features/lookup/PrecinctPage.jsx`: lookup link `precinct_error`, retry `precinct`.
- `src/features/waitTimes/WaitTimesPage.jsx`: directions, lookup link, retry `wait_times`.
- `src/features/lookup/ShareLink.jsx`: `share` with its method.
- `src/components/ErrorBoundary.jsx`: its lookup links, `error_screen` (added during
  Phase 4: it also renders `OfficialLookups`, which now needs a `card`).
- `src/features/lookup/PollsCard.jsx` also gets `DirectionsLinks`, shared by the polls,
  early voting and wait times rows (one place for the directions event).
- Component tests: a shared helper `src/test/trackedEvents.js` starting GA on a stand-in window,
  as `analyticsPrivacy.test.jsx` does, so tests read the real dataLayer.
- `src/test/analyticsPrivacy.test.jsx`: events checked for voter data.
- `e2e/analytics.e2e.js`: the presses.
- `src/i18n/en.json` (`privacy.sent.analytics.text`), `PrivacyPage.analytics.test.jsx`. The
  section's heading becomes "Visit counts" (was "Page counts") and `noTrackingAnalytics` says
  the counts never include what was searched for, since they now count more than pages.
- `src/features/lookup/OutOfCountyNotice.jsx` (its board lookup links, `referral`) and
  `PrecinctStatusBanner.jsx` (its lookup link, `status`): added after review finder 1, so
  every link to a board's official lookup is counted.
- `README.md` (Privacy statement, Google Analytics), `.github/pull_request_template.md`.

## Order of work

1. `track()` and the allowlist, test first.
2. `lookupOutcome.js`, test first; AddressLookup and UseMyLocation.
3. RetryButton, OfficialLookups, OfficialLookupLink, then each card, tests first.
4. ShareLink.
5. Privacy test extension, e2e, notice, README, PR template.
6. Gate; first-load bytes compared to main.

## Risks

- A component passing something personal: the allowlist only passes fixed strings; tests
  run real lookups and scan the dataLayer.
- Budget: index.js grows by a few dozen bytes; the allowlist is in ga.js. Measured.
- Changing `startGa`'s return shape breaks #69 tests that call it: update them in step 1.
- Retry double counting: RetryButton tracks only when Button runs its onClick (not busy).
- `OfficialLookupLink` callers missing `card`: the param is dropped and the event still
  counts; tests cover each caller.

## Proof

- Criterion 1: `src/analytics/index.test.js` track block.
- Criterion 2: per-component tests (click -> dataLayer event, `defaultPrevented` false).
- Criterion 3: `src/test/analyticsPrivacy.test.jsx`.
- Criterion 4: `e2e/analytics.e2e.js`.
- Criterion 5: `PrivacyPage.analytics.test.jsx`, README and template diff.
- Criterion 6: the gate output. Live drive: the e2e spec drives the built app in Chromium
  with GA forced on (the only way to see it on, since the shipped ID is empty).
