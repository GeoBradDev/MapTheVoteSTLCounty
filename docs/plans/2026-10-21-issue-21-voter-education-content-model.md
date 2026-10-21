# Plan: Voter education content model: versioned, sourced, with last-verified dates (issue #21)

Risk tier: Medium. Low base, raised one for build integration (a Vite plugin that every build
and test run goes through) spread over more than a few files. It adds rather than alters
behavior, touches no auth, money, data writes or outward messages, and the pure parsing and
validation is fully unit-testable. The orchestrator's run instructions stand in for the Medium
plan approval (autonomous batch run); noted in the PR.

Domain skills: vercel-react-best-practices: not applicable because the only component is a
static presentational renderer with no effects or data fetching. frontend-design: not
applicable because the renderer reuses existing text and link styles and is not wired into a
route (#23 owns the UI). chrome-devtools-mcp: not applicable because nothing user-visible
changes (see Live drive). humanizer: not applicable because no voter-facing copy is written
beyond two labels ("Sources", "Last verified"). Django, FastAPI, Expo, payments, email: not
applicable because the app is a frontend-only React site.

## Scope limits

- No real voter education content. Topic research and drafting is #22 (parked for an owner
  decision). Tests build fixture topics in memory; `content/en/learn/` ships empty.
- No route or UI change. `/learn` and `/learn/:topic` stay placeholders until #23, which will
  use the loader and renderer added here. `render.yaml` already has `no-cache` rules for
  `/learn` and `/learn/*`, so no hosting change is needed.
- Do not touch #49's files (geocoder, `render.yaml` CSP, `privacyCopy.js`).

## Acceptance criteria

1. A topic is one Markdown file at `content/<locale>/learn/<id>.md` with YAML front matter:
   `id`, `title`, `election`, `lastVerified`, and `sources` (a non-empty list of
   `{ id, label, url }`). Unknown front matter keys fail.
2. A claim cites a source inline with `[^<source id>]`; it renders as a numbered link to that
   source's official URL, and the topic lists its sources with the same numbers. A citation
   of an unknown source id fails.
3. Topics load at build time through Vite `import.meta.glob`: each file is parsed and checked
   by a Vite plugin and becomes a plain JSON module, so the browser bundle carries no YAML or
   Markdown parser and the topics work offline and can be pre-rendered.
4. The build fails (the plugin throws, naming the file and every problem) when a topic:
   has no sources; has no `lastVerified`; has `lastVerified` more than 60 days before the
   config's `electionDate` (or after it); has an `election` that is not the config's
   `electionDate`; contains `TODO` anywhere; has an `id` that does not match its file name;
   cites an unknown source; uses Markdown outside the supported subset; or links (source or
   inline) anywhere but an `https` URL on an official host or a site-relative path.
5. `node scripts/check-content-links.mjs` requests every source and inline link URL in every
   topic, prints PASS or FAIL per URL, and exits 1 on any failure. It runs in the scheduled
   data health workflow, never on pull requests.
6. A topic with a missing source fails `vite build` (proven by a test that runs a real build).
7. The model is ready for Spanish (#19): the locale is the first path segment, the loader is
   keyed by locale and falls back to English per topic, and the renderer's labels live in a
   per-locale copy object.

## Design

- Markdown subset (`src/features/learn/content/markdown.js`): paragraphs, `##` and `###`
  headings (the title comes from front matter, so no `#`), `- ` and `1. ` lists (one level,
  indented continuation lines allowed), `**bold**`, `[text](url)`, `[^id]`. Anything else
  (raw HTML, images, code, blockquotes, tables, `#`, `####`, nested lists, unmatched `**`) is
  an error, so a typo cannot render as something unexpected. Output is a JSON node tree the
  React renderer walks; no HTML strings, no innerHTML.
- Official hosts (`src/features/learn/content/officialSources.js`): any `*.gov` host, plus the
  county board's own `stlouiscovotes.info` and its ArcGIS portal
  `stlouiscovotes.maps.arcgis.com`, which the election config already cites. Extending the
  list is a reviewed code change.
- Topic check (`src/features/learn/content/topic.js`): `parseTopic(text, { file, electionDate })`
  collects every problem and throws one error listing them all, so an author fixes a file in
  one pass. Dates are compared as UTC calendar days.
- Vite plugin (`src/features/learn/content/vitePlugin.js`): `transform` for files matching
  `content/<locale>/learn/<id>.md`; returns `export default <json>`. Registered in
  `vite.config.js`, so dev, build and vitest all run the check.
- Loader (`src/features/learn/topics.js`): `getTopics(locale)` and `getTopic(id, locale)`, with
  `locale` optional (English by default).
- Renderer (`src/features/learn/TopicArticle.jsx`) and `learnCopy.js` (labels by locale).
  Not mounted on a route.
- Link checker (`scripts/check-content-links.mjs`): GET with redirects, 15 s timeout, 3 tries;
  reads front matter and links without the date checks, so it still runs after an election.

## Files that change

- `src/features/learn/content/markdown.js`, `markdown.test.js` (new)
- `src/features/learn/content/officialSources.js` (new)
- `src/features/learn/content/topic.js`, `topic.test.js` (new)
- `src/features/learn/content/vitePlugin.js`, `vitePlugin.test.js` (new, includes a real build)
- `src/features/learn/topics.js`, `topics.test.js` (new)
- `src/features/learn/TopicArticle.jsx`, `TopicArticle.test.jsx`, `learnCopy.js` (new)
- `src/features/learn/LearnTopicPage.jsx` (comment only: points #23 at the loader)
- `vite.config.js` (register the plugin)
- `scripts/check-content-links.mjs`, `src/test/checkContentLinks.test.js` (new)
- `src/test/checkConfig.test.js` (the workflow test also expects the link check step, with a
  step time limit)
- `.github/workflows/data-health.yml` (add the link check step with its own time limit and its
  outcome line; raise the job limit to fit it)
- `content/en/learn/.gitkeep` (new; `content/.gitkeep` removed)
- `README.md` (a "Learn content" section), `docs/progress.md` is not touched by this run

## Order of work

1. Markdown subset parser with tests.
2. Official source check and topic parse/validate with tests (fixtures built in memory from
   the config's `electionDate`, since `src/` may not repeat config dates).
3. Vite plugin with tests, including a real `vite build` of a temp project with a topic that
   has no sources (must reject) and a valid one (must succeed).
4. Register the plugin; loader and tests.
5. Renderer, copy, tests.
6. Link checker script with an injected fetch, tests; workflow step.
7. README.

## Risks

- The plugin runs in every build: a bug there breaks deploys. Mitigated by tests and the real
  build test; with no topics it does nothing.
- `src/test/election-hardcoding.test.js` scans `src/`: tests must not write config dates.
- Official-host allowlist may be too tight for a legitimate source (for example a federal
  `.gov` is fine, but a state page on another domain is not). Then the build says so and the
  list is extended in review.
- Chose not to: wire topics into routes (#23), translate (#19), write content (#22), or add a
  Markdown dependency.

## Proof

- Criteria 1, 2, 4: `topic.test.js`, `markdown.test.js`.
- Criterion 3: `vitePlugin.test.js` (transform output is JSON; parser not in bundle check:
  the real build's output contains no `yaml` import), `topics.test.js`.
- Criterion 5: `checkContentLinks.test.js`; workflow step reviewed.
- Criterion 6: the real-build test in `vitePlugin.test.js`.
- Criterion 7: `topics.test.js` (fallback), `TopicArticle.test.jsx` (labels from copy).
- Live drive: nothing user-visible changes; run `npm run build` and confirm `/learn` still
  renders the placeholder in `npm run preview`.

## Revisions after review

- Finder 1: site paths with a backslash (which browsers read as another host) and
  `https:` URLs without `//` are rejected; ordered lists must be numbered 1, 2, 3 with no
  blank lines between items, so a step number cannot silently change; inline problems no
  longer stop at the first one in a paragraph; topic ids must be lowercase slugs; a BOM is
  ignored; invalid YAML no longer blames valid citations; the link checker fails a redirect
  that lands off the official hosts; the link check step has its own time limit so a slow day
  still opens the data health issue.
- Finder 2: `getTopics` no longer depends on `this`, so it works as a named import; a link URL
  with `(` must be percent-encoded instead of being cut at the first `)`; unindented lines
  that continue a list, block syntax on indented continuation lines, `1)` markers and empty
  items are errors; URLs with whitespace or control characters and titles or labels with text direction controls are rejected; a test fails if app code
  imports the build-time parsers; the config and geocoder steps in the data health workflow
  also get step limits (25 and 20 minutes), and the job limit is 70.
- Finder 3: empty front matter (only comments) reports the problem instead of crashing the
  build; block syntax on a list item's first line, dash-only lines (rules and `--`
  underlines), spaced rules and tab list markers are errors; invisible and text direction
  control characters are rejected anywhere in the body, the title and source labels.
- Finder 4: list item text that starts with `#` but is not a heading (`#2 pencil`) is
  allowed again; only `#` to `######` followed by a space is heading syntax.
