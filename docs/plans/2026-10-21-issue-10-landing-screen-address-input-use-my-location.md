# Plan: Landing screen: one address input plus "Use my location" (issue #10)

Risk tier: Medium. Stateful, async UI (a combobox with debounced suggestions, request
cancellation and keyboard handling) that unit tests can only partly exercise, across
several files, and it handles the voter's typed address. It does not choose where the
address goes: that is the geocoder provider in #7, which this change only calls through an
interface.

Domain skills:
- superpowers:test-driven-development: invoke.
- vercel-react-best-practices: invoke for the combobox and landing components.
- chrome-devtools-mcp (a11y-debugging, chrome-devtools): invoke for the live drive
  (360px layout, focus styles, Lighthouse accessibility, keyboard combobox).
- frontend-design: invoke lightly for the landing layout; it uses the existing tokens only.
- context7: not applicable because only React, wouter and Testing Library APIs already in use
  are needed.
- expo, django, django-ninja, fastapi, claude-api, dataviz: not applicable because none of
  those stacks are involved.

Mode: commit. The owner authorized commits, pushing this issue branch, the PR and its squash
merge for this run, and delegated plan approval for this run.

## Geocoder independence

#7 is parked: the owner has not chosen the geocoder. The landing screen talks to a geocoder
only through a small interface, so #7 plugs in the real provider by changing one module.
No geocoder is hardcoded and no API key is added.

```js
/** @typedef {{ id: string, label: string }} Suggestion  (a provider may add fields) */
/** @typedef {{ lat: number, lng: number, state?: string, county?: string, label: string }} GeocodedPlace */
/**
 * @typedef {object} Geocoder
 * @property {(text: string, options?: { signal?: AbortSignal }) => Promise<Suggestion[]>} suggest
 * @property {(query: string | Suggestion, options?: { signal?: AbortSignal }) => Promise<GeocodedPlace | null>} geocode
 */
```

Until #7 lands, the app's geocoder is "unconfigured": `suggest` returns no suggestions and
`geocode` rejects with `GeocoderUnavailableError`. When the voter submits an address, the
landing screen then says address search is not available right now and points to "Use my
location" and the county's official lookup. (It says nothing before a submit: once #7 lands
the message would never apply, and a standing notice would only confuse.) #7's plan named the second method `resolve`; this interface calls it `geocode`, and
#7 adopts that name.

## Acceptance criteria

1. `src/data/geocoder.js` documents the `Geocoder` interface above, exports
   `GeocoderUnavailableError` and a default `geocoder` that is the unconfigured one. Nothing
   else in `src/` names a geocoder provider or holds a key.
2. `src/features/lookup/geocoderContext.js` exports a `GeocoderContext` (default: that
   geocoder) and `useGeocoder()`. Tests and #7 swap the geocoder through the context
   provider. A test fake, `src/test/fakeGeocoder.js`, implements the interface from a list of
   addresses and records its calls.
3. `AddressSearch` renders a labeled input ("Enter your address") following the WAI-ARIA
   combobox pattern: `role="combobox"`, `aria-autocomplete="list"`, `aria-expanded`,
   `aria-controls`, `aria-activedescendant`; a `role="listbox"` of `role="option"` items.
   ArrowDown/ArrowUp move through suggestions, Enter picks the active one (or submits the
   typed text when none is active), Escape closes the list, a click or tap picks one. A click or tap pick goes through a real
   form submit, like Enter, so "Use my location" drops a pending request (review round 1).
   Any edit to the text drops the old suggestions and the active option at once.
4. Suggestions are requested about 250 ms after typing stops, only at 3 or more characters
   (trimmed), and an in-flight request is aborted when the text changes again or the
   component unmounts. A late or failed suggestion request never shows stale suggestions.
5. Submitting (a picked suggestion, or the typed text with the "Find my precinct" button or
   Enter) calls `geocode` once (even for two submits before a re-render), then `locate(place)` with `{ lat, lng, state, county }`.
   A precinct navigates to `/p/<code>`. Any other kind shows `OutOfCountyNotice` for it on
   the same screen. No match, an unavailable geocoder (`GeocoderUnavailableError`), or a
   failed lookup (any other geocoder or `locate` error) shows a short message in a `role="alert"` region with the official county lookup link.
   While a lookup runs, the button says so and further submits are ignored; any edit of the
   address text cancels that lookup (for an address or the device location) so the voter
   can correct it and submit again (review round 3).
6. "Use my location" (#9) sits under the address box with `addressInputRef` wired to it; its
   place goes to the same `locate` flow. A device point in St. Louis City comes back
   `unknown` (no state or county); the existing `unknown` notice already names the City of
   St. Louis and links the Missouri Secretary of State lookup, so it is shown unchanged.
7. The address text and coordinates never go into the URL, `history.state`,
   `localStorage`, `sessionStorage`, or the page title. Only the precinct code goes in the
   URL.
8. The home page shows: an h1, the election name and the Election Day date read from
   `src/config/election.js` (date formatted in `America/Chicago`), the address search, the
   button, the line "Voters in St. Louis County may vote at any polling place." with a link
   to its official source (the county FAQ, from config), a link to "How to vote" (`/learn`)
   and a link to the official county election site.
9. Mobile-first: no horizontal scroll at 360px; inputs, buttons and the main links are at
   least 44 by 44 px; base font at least 16px; visible focus styles on every interactive
   element (a `:focus-visible` outline using a palette token).
10. The not-found page gets the same address search, as #3's plan promised.
11. Lighthouse accessibility 90+ on `/` (live drive).

## Vote-anywhere wording

#1 is closed. Its decision quotes the county FAQ (https://stlouiscovotes.info/faq/, which
still says it on 2026-10-21): "Voters in Saint Louis County may vote at any polling place."
The issue's draft line adds "registered" and "on Election Day", which the source does not
say. The screen uses the most conservative verified wording, the FAQ's own sentence with
"St." for "Saint", and links the FAQ. #1's caveat (confirm with the Board before launch)
still stands.

## Files that change

- `src/data/geocoder.js` (new), `src/data/geocoder.test.js` (new)
- `src/features/lookup/geocoderContext.js` (new)
- `src/test/fakeGeocoder.js` (new)
- `src/features/lookup/AddressSearch.jsx` (new), `AddressSearch.test.jsx` (new)
- `src/features/lookup/addressSearchCopy.js` (new): its text, for i18n (#19)
- `src/features/lookup/AddressLookup.jsx` (new), `AddressLookup.test.jsx` (new): address
  search plus the button plus the outcome (navigate, notice or error)
- `src/features/lookup/HomePage.jsx`, `src/features/lookup/homeCopy.js` (new),
  `src/features/lookup/HomePage.test.jsx` (new)
- `src/components/NotFoundPage.jsx`
- `src/config/election.js`: `voteAnywhere` with source and verification date, and
  `countySiteUrl`, the county election board's site. (The plan first put the site in
  `referrals.js`, but its root URL is a prefix of the FAQ source in `election.js`, so the
  referral-link test flagged it; `election.js` already holds the county's lookup URL.)
- `src/index.css`: a focus-visible rule
- `src/App.test.jsx`: home page assertions
- `docs/data.md` if it describes the lookup flow

## Order of work

1. Geocoder interface, unconfigured default, fake, context (tests first).
2. AddressSearch combobox (tests first: keyboard, debounce, abort, ARIA).
3. AddressLookup flow (tests first: precinct navigation, notices, errors, privacy).
4. HomePage, copy, config, NotFoundPage, CSS.
5. Gate, live drive at 360px with Lighthouse.

## Risks

- Debounce and abort races: a slow first response arriving after a second one. Guarded by
  aborting and by checking the request is still current before setting state.
- Picking an option with a pointer must not blur-close the list first: options use
  `onMouseDown` preventDefault and a click handler.
- The #9 button listens to the input's `click`, `input` and form `submit`; the address box
  must be a real input inside a real `<form>` so those events fire.
- Focus after an outcome: notices and errors get focus or are announced, so screen reader
  users hear the result.
- Not done here: the results screen (#11), retry and slow states (#18), i18n (#19), the
  privacy notice (#20), the real geocoder (#7).

## Proof

- `geocoder.test.js`: criteria 1 (unconfigured behavior).
- `AddressSearch.test.jsx`: criteria 3, 4 (fake timers, keyboard only).
- `AddressLookup.test.jsx`: criteria 5, 6, 7 (fake geocoder, mocked `locate`, URL and
  storage checks).
- `HomePage.test.jsx` and `App.test.jsx`: criteria 8, 10.
- Live drive: 360px viewport, `scrollWidth <= innerWidth`, element sizes, focus ring
  visible, Lighthouse accessibility score (criteria 9, 11), with a temporary fake geocoder
  injected only in the drive harness, never committed.
