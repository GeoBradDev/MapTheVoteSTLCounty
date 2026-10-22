# Plan: Internationalization foundation, English now, Spanish-ready (issue #19)

Risk tier: Medium. A refactor of existing behavior across many files (every copy module),
but every string it moves is covered by unit tests that assert the English text, and a
before/after snapshot of every copy value proves English output is unchanged. No service,
storage, auth or data path changes.

Domain skills: vercel-react-best-practices: not applicable because no rendering, data
fetching or bundle pattern changes beyond one static JSON import; the Lighthouse budget in
the gate covers bundle cost. frontend-design: not applicable because nothing visible
changes (the switcher renders nothing with one locale).

## Acceptance criteria

1. Every UI string the app renders comes from `src/i18n/en.json` through `t()`: the copy
   modules, the skip link, the not found page, the footer link and the tab title suffix.
   Values from the county's data (district names, places), election values from
   `src/config/election.js` (the election's name), and the address search services' names
   and data names from the geocoder modules (the privacy notice requires them there) are not
   translated.
2. English output is identical: every copy value, called with sample arguments, matches the
   value before the change, and the existing test suite passes unchanged.
3. `t(key, params)` interpolates `{name}` and supports ICU-style plurals
   (`{count, plural, one {...} other {...}}`, `#` for the count) with `Intl.PluralRules`.
   A key missing from a locale falls back to English.
4. `<html lang>` follows the active locale.
5. Dates are formatted with `Intl.DateTimeFormat` in the active locale with
   `timeZone: 'America/Chicago'` (one helper in `src/i18n`). Calendar dates (YYYY-MM-DD)
   are formatted at noon UTC so the day never shifts.
6. A language switcher component exists and renders nothing while only one locale is
   configured.
7. A lint rule (`react/jsx-no-literals`) fails on raw words in JSX text.
8. Adding `src/i18n/es.json` and one line in `src/i18n/config.js` turns on Spanish: a test
   proves it with a stand-in locale (messages override, `<html lang>`, fallback, switcher
   shows).
9. English stays in the main bundle (it renders first); any other locale loads only when
   chosen, so the performance budgets are unaffected.

## Files that change

- New: `src/i18n/config.js` (locale list, default, time zone), `src/i18n/index.js` (`t`,
  `getLocale`, `setLocale`, `useLocale`, `translated`, date helpers), `src/i18n/format.js`
  (message formatter), `src/i18n/en.json`, `src/i18n/LanguageSwitcher.jsx`, tests.
- Copy modules rewritten to read from `t()` with the same exported shape:
  `src/components/errorBoundaryCopy.js`, `src/features/learn/learnCopy.js`,
  `src/features/lookup/{addressSearch,assignedPollingPlace,error,home,lookup,outOfCounty,results,useMyLocation}Copy.js`,
  `src/features/privacy/privacyCopy.js`.
- JSX literals moved: `src/App.jsx` (skip link, locale key, switcher),
  `src/components/NotFoundPage.jsx`, `src/components/SiteFooter.jsx` (one word),
  `src/components/usePageTitle.js` (site name).
- Dates: `src/features/lookup/earlyVoting.js` (`formatLongDate`),
  `src/features/learn/TopicArticle.jsx`.
- Learn pages use the active locale's labels and topics: `LearnPage.jsx`,
  `LearnTopicPage.jsx`.
- `eslint.config.js`: `react/jsx-no-literals` for app JSX, punctuation allowed.
- `README.md`: how to add a language.

## Order of work

1. Snapshot every copy value (functions called with sample arguments) to the scratchpad.
2. Message formatter and `t()` with tests (TDD).
3. `en.json` and the copy modules, one module at a time; compare against the snapshot.
4. JSX literals, `usePageTitle`, dates, learn pages.
5. `<html lang>`, switcher stub, stand-in locale test, lint rule.
6. README; full gate; live drive of home, a precinct page, /learn, /privacy.

## Risks

- A typo in a moved string changes English output. Mitigation: the snapshot comparison
  plus the existing tests.
- Copy objects are read at module load in a few places. Mitigation: `translated()` returns
  a proxy that builds the object for the active locale on access and caches it per locale,
  so identity is stable and the exported shape is unchanged.
- Date shifts. Mitigation: calendar dates format at noon UTC in America/Chicago, the same
  day in every case.
- Conflict with open PR #115 (#71), which edits `homeCopy.js`, `privacyCopy.js` and
  `SiteFooter.jsx`: its new strings must move to `en.json` when it rebases. Kept small by
  leaving component markup alone.

Not done: choosing the initial locale from the browser, or a `?lang=` parameter (a decision
for when Spanish exists); translating `electionName` (an election value in config);
translating `index.html`'s static title, which stays the home page's tab title (no page
restores a translated base title yet); remembering the chosen language across reloads. These
are follow-ups for when Spanish is added.

Revisions during review: `setLocale` keeps only the last pick when a file is still loading,
and the switcher ignores a failed load; `src/i18n/addLocale.test.js` proves the real loader
with a copy of `src/i18n` plus an `es.json` and one config line; docs that named the old copy
files as the place for the privacy notice and the learn group labels now name `en.json`.

## Proof

- Criterion 1: lint rule (7) plus a test that every key the copy modules use exists in
  `en.json`.
- Criterion 2: snapshot comparison output in the PR, plus the unchanged suite.
- Criteria 3, 4, 5, 6: `src/i18n/i18n.test.jsx`, `src/i18n/format.test.js`.
- Criterion 8: `src/i18n/addLocale.test.js` (Vite's real loader finds `es.json`).
- Criterion 9: build output and `npm run test:perf`.
- Live drive: home, a precinct page, /learn, a topic, /privacy and the not found page
  render the same English as on main.
