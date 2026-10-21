// CSS color helpers for the palette guards (theme.test.js reads our source CSS,
// build.test.js reads the built CSS). Not a full CSS parser: a regression net.
import { JSDOM } from 'jsdom';

// OKLCH hue ranges that read as red or blue. Chroma below the floor is gray.
const CHROMA_FLOOR = 0.04;
const RED_HUES = [
  [0, 45],
  [330, 360],
];
const BLUE_HUES = [[200, 290]];

// Words the browser accepts as a color that carry no hue of their own.
const NEUTRAL_KEYWORDS = new Set([
  'currentcolor',
  'transparent',
  'inherit',
  'initial',
  'unset',
  'revert',
  'revert-layer',
]);

// A quoted string, honoring backslash escapes.
export const STRING = /(["'])((?:\\[\s\S]|(?!\1)[^\\])*)\1/g;

// Removes comments but leaves strings alone, so a glob such as
// `@source "../content/*.md"` is not read as the start of a comment.
export function stripComments(css) {
  return css.replace(new RegExp(`${STRING.source}|\\/\\*[\\s\\S]*?(?:\\*\\/|$)`, 'g'), (m) =>
    m.startsWith('/*') ? ' ' : m,
  );
}

const URL = new RegExp(`url\\(\\s*(?:${STRING.source}|([^)]*))\\s*\\)`, 'gi');

// url() targets are not colors, so they are blanked. Data URIs are banned
// outright (see dataUris) rather than decoded.
export function blankUrls(code) {
  return code.replace(URL, 'url()');
}

// Every data URI, in url() or in a plain string (image-set() takes both).
export function dataUris(css) {
  const code = stripComments(css);
  const urlTargets = [...code.matchAll(URL)].map((m) => m[2] ?? m[3]);
  const strings = [...blankUrls(code).matchAll(STRING)].map((m) => m[2]);
  return [...urlTargets, ...strings]
    .map((target) => target.trim())
    .filter((target) => /^data:/i.test(target))
    .map((target) => target.slice(0, 40));
}

// Every `property: value` in the CSS, at any nesting depth, plus the arbitrary
// values in each `@apply` (`bg-[#dc2626]` reads as `#dc2626`). A value must end
// at `;` or `}`, so a selector like `a:not(.red) {` is not read as one.
// Quoted strings (content, font names) are blanked.
export function declarations(css) {
  const code = blankUrls(stripComments(css)).replace(STRING, '""');
  const props = [...code.matchAll(/([\w-]+)\s*:\s*([^;{}]+)(?=[;}])/g)].map((m) => ({
    property: m[1],
    value: m[2].trim(),
  }));
  const applies = [...code.matchAll(/@apply\s+([^;{}]+)/g)].map((m) => ({
    property: '@apply',
    value: [...m[1].matchAll(/\[([^\]]+)\]/g)].map((a) => a[1].replace(/_/g, ' ')).join(', '),
  }));
  return [...props, ...applies];
}

const probe = new JSDOM('').window.document.createElement('div');

function isNamedColor(word) {
  if (NEUTRAL_KEYWORDS.has(word.toLowerCase())) return false;
  probe.style.color = '';
  probe.style.color = word;
  return probe.style.color !== '';
}

// Color literals in a value: color functions, hex colors and named colors.
// Named colors are found anywhere, including inside color-mix(), light-dark()
// and var() fallbacks; only the color functions themselves are blanked first.
const COLOR_FUNCTION = /(?<![\w-])(?:oklch|oklab|rgba?|hsla?|hwb|lab|lch|color)\([^)]*\)/gi;
const HEX = /#[0-9a-f]{3,8}\b/gi;

export function colorLiterals(value) {
  const functions = [...value.matchAll(COLOR_FUNCTION)].map((m) => m[0]);
  const hex = [...value.matchAll(HEX)].map((m) => m[0]);
  const words = value
    .replace(COLOR_FUNCTION, ' ')
    .replace(HEX, ' ')
    .split(/[^a-z-]+/i)
    .filter((word) => word && isNamedColor(word));
  return [...functions, ...hex, ...words];
}

export function parseOklch(literal) {
  const m = literal.match(/^oklch\(\s*(-?[\d.]+%?)\s+(-?[\d.]+)\s+(-?[\d.]+)(?:deg)?\s*\)$/i);
  if (!m) return null;
  const hue = ((Number(m[3]) % 360) + 360) % 360;
  return { chroma: Number(m[2]), hue };
}

function inRanges(hue, ranges) {
  return ranges.some(([lo, hi]) => hue >= lo && hue <= hi);
}

export function partyColor(literal) {
  const color = parseOklch(literal);
  if (!color || color.chroma < CHROMA_FLOOR) return null;
  if (inRanges(color.hue, RED_HUES)) return 'red';
  if (inRanges(color.hue, BLUE_HUES)) return 'blue';
  return null;
}

// Named colors with no hue. Any other named color is treated as unreadable.
const ACHROMATIC_NAMES = new Set(['black', 'white', 'gray', 'grey', 'silver']);

export function isAchromaticName(literal) {
  return ACHROMATIC_NAMES.has(literal.toLowerCase());
}

// sRGB channels (0 to 1) from a hex or rgb() literal, or null.
function parseSrgb(literal) {
  const hex = literal.match(/^#([0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/i);
  if (hex) {
    const digits = hex[1].length <= 4 ? [...hex[1]].map((d) => d + d) : hex[1].match(/../g);
    return digits.slice(0, 3).map((d) => parseInt(d, 16) / 255);
  }
  const rgb = literal.match(/^rgba?\(\s*([^)]*)\)$/i);
  if (!rgb) return null;
  const channels = rgb[1]
    .split(/[\s,/]+/)
    .filter(Boolean)
    .slice(0, 3);
  if (channels.length < 3) return null;
  return channels.map((c) => (c.endsWith('%') ? parseFloat(c) / 100 : parseFloat(c) / 255));
}

// Converts a hex or rgb() literal to an `oklch(L C H)` string, so the same hue
// check applies to every color Tailwind ships (it writes opacity modifiers such
// as bg-primary/50 as hex fallbacks). Math from https://bottosson.github.io/posts/oklab/
export function toOklch(literal) {
  if (parseOklch(literal)) return literal;
  const srgb = parseSrgb(literal);
  if (!srgb) return null;
  const [r, g, b] = srgb.map((c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  const L = 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s;
  const A = 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s;
  const B = 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s;
  const hue = (Math.atan2(B, A) * 180) / Math.PI;
  return `oklch(${L.toFixed(4)} ${Math.hypot(A, B).toFixed(4)} ${hue.toFixed(2)})`;
}

// Removes `@supports (...)` conditions, where Tailwind's preflight probes for
// browser features with `rgb(from red r g b)` and `color-mix(in lab, red, red)`.
// The rules inside those blocks are still checked.
export function stripSupportsConditions(css) {
  return css.replace(/@supports[^{]*\{/g, '@supports {');
}
