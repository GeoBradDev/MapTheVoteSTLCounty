# MapTheVoteSTLCounty

## Development

CI uses Node 24; use the same version locally.

```sh
npm install
npm run dev           # start the dev server
npm run build         # build the static site into dist/
npm run preview       # serve dist/ locally
npm test              # run the tests once (npm run test:watch to watch)
npm run lint          # ESLint, including jsx-a11y rules
npm run format        # format with Prettier (npm run format:check to check only)
```

CI runs lint, format check, tests and build on every pull request and on push to `main`.

## Smoke test

After a deploy, check the live site or a PR preview:

```sh
npm run smoke -- https://<site-or-preview-url>
```

It checks that `/` and a hard load of `/p/CC007` return the app shell, that a hashed asset is
served as JavaScript, and that the expected security and cache headers are present. It exits 1
and lists what failed. Against a host that sets no headers, such as `npm run preview`, add
`--skip-headers`. The expected headers are a table at the top of `scripts/smoke.mjs`; change it
when the host's header config changes.

## Colors

The palette is nonpartisan: no red or blue. Define colors only as oklch `--color-*` tokens in
`src/index.css` and use them through Tailwind classes. The tests fail on red or blue in the
CSS under `src` or in the built CSS, and on any `data:` URI in the CSS under `src` (put icons in
SVG components that use `currentColor`). Only CSS is checked: a color written anywhere else
(`index.html`, JSX props or SVG attributes, JavaScript strings) is not, so use token classes
there instead of color values.
