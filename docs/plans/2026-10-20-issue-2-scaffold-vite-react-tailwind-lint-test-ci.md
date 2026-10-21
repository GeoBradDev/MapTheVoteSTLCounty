# Plan: Scaffold Vite + React (JavaScript) + Tailwind project with lint, test, and CI (issue #2)

Risk tier: Medium. Not a forced-High area. Raised from Low once for touching more than a few
files (package manifest, configs, CI workflow, source tree). The rest is new code with no
existing behavior to break, and every criterion can be checked by a command.

Domain skills:
- vercel-react-best-practices: invoke. The app root and entry point are React code.
- context7 (docs lookup): invoke. Vite 8, Tailwind 4, ESLint flat config and Vitest 5 changed
  their config formats recently; check each against current docs instead of memory.
- frontend-design: not applicable because this issue ships no screens. It only defines neutral
  token names; the landing and results design belong to #10 and #11.
- expo, django, fastapi, dataviz, claude-api: not applicable because none of those stacks or
  outputs are involved.

## Acceptance criteria

1. `npm run build` produces a static `dist/` with no errors, containing `index.html` and hashed
   files under `dist/assets/`.
2. `npm run dev`, `npm run build`, `npm run preview`, `npm test` and `npm run lint` all exist and
   work. `npm run format` and `npm run format:check` run Prettier.
3. Plain JavaScript only: source files are `.js` / `.jsx`, there is no `tsconfig.json`, and no
   TypeScript dependency is added directly.
4. ESLint flat config enables the recommended rules of `eslint-plugin-react`,
   `eslint-plugin-react-hooks` and `eslint-plugin-jsx-a11y`, and Prettier compatibility
   (`eslint-config-prettier`). A test proves a jsx-a11y violation (an `<img>` with no `alt`)
   fails lint.
5. Vitest runs with jsdom, React Testing Library and `@testing-library/jest-dom` matchers
   available in every test file without per-file setup.
6. Tailwind CSS 4 is wired through `@tailwindcss/vite`. The color palette is defined once, as
   design tokens in `src/index.css` `@theme`, with neutral colors only: no red or blue as a
   primary, accent or brand color. A test reads the token file and fails if a primary/accent
   token is red or blue.
7. Folders exist: `src/config`, `src/data`, `src/features/lookup`, `src/features/learn`,
   `src/components`, `src/i18n`, `content/`.
8. GitHub Actions workflow runs install (`npm ci`), lint, format check, test and build on every
   pull request and on push to `main`.
9. `.gitignore` covers `node_modules`, `dist` and `.idea/` workspace files.
10. Placeholder `index.js` is removed and `package.json` no longer has the `${PROJECT_NAME}`
    placeholder name.
11. CI passes on the PR (checked in Phase 10, after the user pushes).

## Files that change

- `package.json`: real name, `"type": "module"`, scripts, dependencies.
- `package-lock.json`: new, from `npm install`.
- `index.js`: deleted.
- `.gitignore`: add `node_modules/`, `dist/`, `coverage/`, `*.local`; keep `.idea/`.
- `index.html`: Vite entry, `lang="en"`, viewport meta, title.
- `vite.config.js`: React and Tailwind plugins, `base: '/'`, Vitest `test` block (jsdom,
  globals, setup file).
- `eslint.config.js`: flat config (JS recommended, react, react-hooks, jsx-a11y, react-refresh,
  prettier last), ignores `dist`, `coverage`, `docs/raw`.
- `.prettierrc.json`, `.prettierignore`: format rules; ignore `dist`, `coverage`, lockfile,
  `docs/raw`, `*.md`.
- `scripts/inspect-data.mjs`: Prettier line wrap only, no logic change.
- `docs/plans/2026-10-20-issue-2-scaffold-vite-react-tailwind-lint-test-ci.md`: this plan.
- `src/main.jsx`: mounts `<App />` in `StrictMode`, imports `index.css`.
- `src/App.jsx`: minimal placeholder shell: a `<main>` with an `<h1>` naming the app. No
  election facts (those need sources and belong to later issues).
- `src/index.css`: `@import 'tailwindcss' source(none);` with explicit `@source` lines (see
  Review fixes) and the `@theme` neutral token palette.
- `src/test/setup.js`: imports `@testing-library/jest-dom/vitest`, runs RTL `cleanup` after
  each test.
- `src/App.test.jsx`: renders `<App />`, asserts the heading and `main` landmark.
- `src/test/lint.test.js`: runs ESLint programmatically on a JSX snippet with an `<img>` lacking
  `alt` and asserts `jsx-a11y/alt-text` is reported as an error; also asserts clean code passes,
  and that a conditional hook (`react-hooks/rules-of-hooks`) and an unescaped entity
  (`react/no-unescaped-entities`) are errors, so all three plugins are proven loaded.
- `src/test/theme.test.js`: finds every color literal in CSS under `src` and asserts each is an
  oklch `--color-*` token that is not a red or blue hue, and that there is one `@theme` block.
- `src/test/palette.test.js`: compiles `src/index.css` with Tailwind and asserts default palette
  utilities (`bg-blue-700`, `text-red-600`) are not generated (added in review, see Proof).
- `src/test/build.test.js`: runs a production build and fails on any red or blue color in the
  shipped CSS (hex and `rgb()` are converted to OKLCH; colors it cannot read are reported)
  (added in review, frozen and later rewritten with approval, see Proof).
- `src/test/colors.js`: CSS color helpers shared by `theme.test.js` and `build.test.js`.
- `src/test/tooling.test.js`: asserts Vitest and Prettier skip `.claude`, and that Tailwind
  scans only `index.html` and `src` (added in review).
- `eslint.config.js`, `vite.config.js`, `.prettierignore` also ignore `.claude`, where Claude
  worktrees live (added in review). `src/index.css` sets Tailwind's sources explicitly.
- `.gitkeep` files in `src/config`, `src/data`, `src/features/lookup`, `src/features/learn`,
  `src/components`, `src/i18n`, `content/`.
- `.github/workflows/ci.yml`: on `pull_request` and `push` to `main`; Node 24 with npm cache;
  `npm ci`, `npm run lint`, `npm run format:check`, `npm test`, `npm run build`, then a check
  that `dist/index.html` and `dist/assets/*` exist.
- `README.md`: short "Development" section listing the npm scripts, the Node version CI uses and
  what CI runs, plus a short "Colors" section (added in Phase 8) stating the palette rules the
  tests enforce and what they do not check. (The full README is #29.)

## Order of work

1. Clean up: delete `index.js`, rewrite `package.json` (name, type, scripts), update
   `.gitignore`.
2. Install dependencies at their current versions, as caret ranges pinned by
   `package-lock.json` (see Risks for the ESLint pin). Runtime: `react`, `react-dom`. Dev:
   `vite`, `@vitejs/plugin-react`, `tailwindcss`, `@tailwindcss/vite`, `eslint`, `@eslint/js`,
   `eslint-plugin-react`, `eslint-plugin-react-hooks`, `eslint-plugin-jsx-a11y`,
   `eslint-plugin-react-refresh`, `eslint-config-prettier`, `globals`, `prettier`, `vitest`,
   `jsdom`, `@testing-library/react`, `@testing-library/dom`, `@testing-library/jest-dom`, and
   `@testing-library/user-event` for the interaction tests the lookup screens (#10) need.
   Scripts also include `test:watch`.
3. Vite + React: `index.html`, `vite.config.js`, `src/main.jsx`, `src/App.jsx`.
4. Test harness: Vitest block in `vite.config.js`, `src/test/setup.js`. TDD: write
   `src/App.test.jsx` first, see it fail, then write `App.jsx`.
5. Tailwind: `src/index.css` with tokens. TDD: `theme.test.js` first.
6. Lint: TDD with `lint.test.js` first (fails with no config), then `eslint.config.js`.
7. Prettier config, run `npm run format` once so `format:check` is green.
8. Folder layout `.gitkeep` files.
9. CI workflow.
10. README development section (a Colors section was added in Phase 8).
11. Full gate: `npm ci && npm run lint && npm run format:check && npm test && npm run build`.

## Risks

- **ESLint 10 is not supported by `eslint-plugin-react` 7.37.5 or `eslint-plugin-jsx-a11y`
  6.10.2** (their peer ranges stop at ESLint 9). Pin `eslint@^9.39` and `@eslint/js@^9` so
  `npm ci` does not fail on peer conflicts and the rules actually load. This is the riskiest
  step; if `npm install` still reports a peer conflict, stop and report rather than use
  `--legacy-peer-deps`. Found during install: npm prints "eslint@9.39.5: This version is no
  longer supported". Accepted, because `eslint-plugin-jsx-a11y` has no release (latest 6.10.2,
  no prerelease tag) that supports ESLint 10, and jsx-a11y is required. Move to ESLint 10 when
  it does.
- Vite 8 / plugin-react 6 / Vitest 5 are new majors; config keys are checked against current
  docs (context7) before use.
- Prettier on the whole repo would reformat `docs/data.md` and `scripts/inspect-data.mjs`. Keep
  `docs/raw` ignored; accept formatting of the two authored files only if the diff is
  whitespace-only, otherwise add them to `.prettierignore`. No content change to docs.
  Outcome: all diffs were whitespace, but Prettier pads every `docs/data.md` table row to the
  widest cell (about 135 columns), so `*.md` is in `.prettierignore`. `scripts/inspect-data.mjs`
  gets one line wrapped.
- `.idea/.gitignore` is tracked today. Leave it tracked; the root `.gitignore` keeps ignoring
  the rest of `.idea/`.
- Node version: CI uses Node 24 to match local (v24.18.0). Pinning `.node-version` for Render
  is #31's task and is not done here.

Not doing (out of scope, owned elsewhere): routing (#3), `render.yaml` and headers (#31),
election config (#4), i18n library (#19), any real UI or election facts.

## Proof

| Criterion | Proof |
| --- | --- |
| 1 | Gate `npm run build`, then `ls dist dist/assets`; CI step checks the same |
| 2 | Run each script; `npm run dev` and `npm run preview` started and curled for HTTP 200 with the app shell, then stopped |
| 3 | `git ls-files` / `find src -name '*.ts*'` show no TS sources; no `tsconfig.json`; `package.json` has no `typescript` dependency |
| 4 | `src/test/lint.test.js` |
| 5 | `src/App.test.jsx` uses `toBeInTheDocument` with no per-file import |
| 6 | `src/test/theme.test.js` (source CSS), `src/test/palette.test.js` (default palette gone) and `src/test/build.test.js` (shipped CSS has no red or blue) |
| 7 | `ls` of each folder |
| 8 | Read `.github/workflows/ci.yml`; `npx --yes actionlint` if available |
| 9 | `git check-ignore node_modules dist .idea/workspace.xml` |
| 10 | `index.js` absent; `package.json` name |
| 11 | Phase 10, after push |

### Review fixes

Review finder 1 showed that `@import 'tailwindcss'` keeps Tailwind's default palette, so
`bg-blue-700` and `text-red-600` still compile, and criterion 6 ("defined once, neutral only")
did not hold. Frozen test `src/test/palette.test.js` compiles `src/index.css` with Tailwind. Red
run before the fix (`npx vitest run src/test/palette.test.js`):

```
     × drops the default red and blue colors 7ms
AssertionError: expected '/*! tailwindcss v4.3.3 | MIT License …' not to match /\.bg-blue-700\b/
      Tests  1 failed | 1 passed (2)
```

Fix: `--color-*: initial;` at the top of `@theme` clears the default palette.

The same review found gaps in `src/test/theme.test.js`: hues above 360 were not wrapped, the
`@theme` block parser stopped at the first `}`, only tokens named primary, accent or brand were
checked, and `--color-*` overrides outside `@theme` were not read. The test now wraps hues and
checks every token wherever it is declared. A future status color (for example an error red)
needs an explicit, reviewed exception there.

Review finders 2 and 3 found that Tailwind 4 also builds color utilities from other theme
namespaces (`--background-color-*`, `--text-color-*`, `--fill-*`, `--stroke-*`,
`--default-ring-color`) and from colors inside composite values (`--shadow-*`,
`--background-image-*`), all of which a name-based scan missed. The guard now checks values, not
names: it reads every declaration in every CSS file under `src`, finds every color literal (color
functions, hex, and named colors detected with jsdom's CSS parser), and fails unless each one is
an oklch value in a `--color-*` token that is not red or blue.

Review finder 4 found two more gaps. Named colors inside other functions
(`color-mix(in srgb, red 80%, white)`, `light-dark()`, `var(--x, crimson)`) were discarded with
the function, and `@apply bg-[#dc2626]` was never read. The guard now blanks only the color
functions themselves before scanning for named colors, and reads the arbitrary values in each
`@apply`. Separately, `eslint .` and Vitest run from the main checkout picked up the full repo
copies in Claude worktrees under `.claude/worktrees/`, so lint failed there. `.claude` is now
ignored by ESLint, Vitest (on top of its default excludes) and Prettier, proven by
`src/test/lint.test.js` and `src/test/tooling.test.js`. The run stopped here once (two extra
finders in a row led to fixes); the user approved fixing both and resuming on 2026-10-20.

Review finder 5 found the guard failed spuriously on CSS with no color (`url(/img/white.png)`,
a selector like `a:not(.red) {` read as a declaration, quoted strings), and missed colors in
inline SVG data URIs (`%231d4ed8`, and `;utf8,` cutting the value short). The guard now blanks
`url()` paths and quoted strings, and reads a declaration only when its value ends at `;` or
`}`.

Review finder 6 showed that decoding data URIs could not keep up (color functions inside them,
a stray `%` stopping percent-decoding, base64). The run stopped a second time and the user chose
on 2026-10-20 to ban data URIs instead: the guard fails on any `data:` URI in CSS under `src`,
and icons go in SVG files or components that use `currentColor`. The user also approved
`@source not '../.claude';` in `src/index.css`, so Tailwind's class scan skips Claude worktrees
too (checked with a probe class under `.claude/`: absent from the build with the line, present
without it).

Review finder 7 found that comment stripping ignored strings, so a glob such as
`@source "../content/*.md"` hid every later declaration from the guard, and that a data URI
written as a plain string in `image-set()` (or in upper-case `URL()`) escaped the ban. Comment
stripping and string blanking now skip over quoted strings and honor backslash escapes, and
the ban checks every `url()` target and every quoted string.

Review finder 8 found that `@source inline("bg-[#1d4ed8]")` safelists utilities the source guard
never reads. Checking the built CSS while triaging it found a worse, shipped defect:
`dist/assets/index-*.css` contained `.bg-\[\#dc2626\]{background-color:#dc2626}`. Tailwind's
automatic source detection scans every tracked file, so it turned the example string
`bg-[#dc2626]` in this plan and in a test fixture into a real red utility. The run stopped a
third time and the user chose on 2026-10-20 to do both of these:

- A: Tailwind scans only the app source. `@import 'tailwindcss' source(none);` turns off
  automatic detection, and explicit `@source` lines add `index.html` and `src`, minus `src/test`
  and `*.test.*` files. This replaces `@source not '../.claude';`, since `.claude` is no longer
  scanned at all.
- B: a check on the CSS that actually ships. Frozen test `src/test/build.test.js` runs a Vite
  production build into a temp directory and fails if any color in a declaration value is red or
  blue (the `@supports` feature probes in preflight are skipped). As first written it also
  rejected every non-gray hue outside oklch; the approved rewrite below converts hex and `rgb()`
  to OKLCH instead and reports only colors it cannot read (named hues, `hsl()`, `oklab()`). This
  covers
  `@source inline()`, JSX arbitrary values and scanned files, which no source check can see. The
  shared helpers moved to `src/test/colors.js`.

Red run of `src/test/build.test.js` before fix A (`npx vitest run src/test/build.test.js`):

```
     × ships no red or blue color 10ms
AssertionError: expected [ '#dc2626' ] to deeply equal []
      Tests  1 failed | 3 passed (4)
```

**Frozen test rewritten, approved by the user on 2026-10-20.** Review finder 9 showed that
`src/test/build.test.js` asserted the wrong behavior: it accepted only oklch values or exact
grays, but Tailwind ships opacity modifiers on our own tokens as hex fallbacks
(`bg-primary/50` gives `#20594380`, `text-ink/70` gives `#1b1a18b3`), so routine classes would
fail CI with no party color present. Reproduced in the real build before the rewrite. The
rewritten test converts every hex and `rgb()` color to OKLCH (`toOklch` in
`src/test/colors.js`) and fails only on red or blue hues; named hues and other color functions
are still reported as unreadable. It also asserts `.bg-surface` ships, so it fails if the app
source stops being scanned. The rewritten test is frozen like the original.

Proof the rewrite still catches the defect: the default-branch base predates the app, so the
proof ran in this worktree with `src/index.css` temporarily switched back to automatic
scanning (`@import 'tailwindcss';`, no `@source` lines), then restored:

```
     × ships no red or blue color 8ms
AssertionError: expected [ '#1d4ed8', '#dc2626' ] to deeply equal []
      Tests  1 failed | 4 passed (5)
```

With `bg-primary/50 text-ink/70 border-border/50` temporarily added to `App.jsx`, the rewritten
test passes (5 of 5). From the same review's notes, `*.spec.*` files are also excluded from
Tailwind's scan.

Review finder 11 found that CSS shipped inline in `dist/index.html` (a `<style>` block or a
`style=""` attribute written in `index.html`) is not read by `src/test/build.test.js`, which
reads only `dist/assets/*.css`. On 2026-10-20 the user chose to end review here and leave this
as a known gap: `index.html` is not guarded by any palette check, like its `theme-color` meta
tag. Keep colors out of `index.html`; style through `src/index.css` tokens. From the same review's notes: `@testing-library/dom` (RTL's
peer) is listed explicitly, `.jsx` helpers under `src/test/` get the test globals, and the CI
output check requires the hashed `index-*` asset names.

CI: superseded runs are cancelled for pull requests only, and each push gets its own
concurrency group (a shared group cancels a pending run even without `cancel-in-progress`), so
every push to `main` keeps a completed CI run.

Live drive (Medium: drive the changed path): start `npm run dev` and `npm run preview`, load the
page in a browser, confirm the heading renders and Tailwind styles apply (computed background
from a token), and the console has no errors.
