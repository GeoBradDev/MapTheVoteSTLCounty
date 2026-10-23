// The shared components (#78) hold the link and button looks. A feature file
// that writes its own class string for them drifts from the rest of the site.
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';

const SRC = path.resolve(import.meta.dirname, '..');
const SHARED = new Set([
  'buttonClass.js',
  'Button.jsx',
  'TextLink.jsx',
  'Card.jsx',
  'Notice.jsx',
  'Disclosure.jsx',
]);

function jsxFiles(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return jsxFiles(full);
    return /\.jsx$/.test(entry.name) && !/\.test\.jsx$/.test(entry.name) ? [full] : [];
  });
}

const files = [...jsxFiles(path.join(SRC, 'features')), ...jsxFiles(path.join(SRC, 'components'))]
  .filter((file) => !SHARED.has(path.basename(file)))
  .map((file) => ({ file: path.relative(SRC, file), text: readFileSync(file, 'utf8') }));

describe('shared link and button styles', () => {
  it('finds the feature files', () => {
    expect(files.length).toBeGreaterThan(20);
  });

  it('defines no link, button or row class string outside the shared components', () => {
    const names = 'linkClass|tapLinkClass|buttonClass|rowClass|navLink|directionsClass|BUTTON';
    // A local definition (const linkClass = ...) or a class passed as a prop.
    const defined = new RegExp(`\\b(?:const|let|var)\\s+(?:${names})\\b|\\b(?:${names})=`);
    expect(files.filter(({ text }) => defined.test(text)).map(({ file }) => file)).toEqual([]);
  });

  it('writes the link look (text-primary underline) only in TextLink', () => {
    expect(
      files.filter(({ text }) => /text-primary underline/.test(text)).map(({ file }) => file),
    ).toEqual([]);
  });

  it('writes no button fill or border look outside Button', () => {
    // Not a state variant such as aria-selected:bg-primary (a listbox option).
    const look =
      /(?<![:\w-])bg-primary\b[^'"`]*\btext-on-primary\b|\bborder(-2)? border-primary\b[^'"`]*\btext-primary\b/;
    // The skip link in App.jsx is outside src/features and src/components.
    expect(files.filter(({ text }) => look.test(text)).map(({ file }) => file)).toEqual([]);
  });
});
