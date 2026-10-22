// A small ICU-style message formatter for the strings in src/i18n/<locale>.json.
// It knows two forms:
//   {name}                                   the value of `name`
//   {count, plural, =0 {...} one {...} other {...}}
//                                            a branch picked by an exact =N match,
//                                            else by Intl.PluralRules, else `other`;
//                                            # in the branch is the count
// Braces are only for these forms: a message has no other { or }. Apostrophes
// are plain text (no ICU quoting).

const pluralRules = new Map();

function pluralCategory(locale, n) {
  if (!pluralRules.has(locale)) pluralRules.set(locale, new Intl.PluralRules(locale));
  return pluralRules.get(locale).select(n);
}

/** The index of the brace that closes the one at `open`, or -1. */
function closingBrace(text, open) {
  let depth = 0;
  for (let i = open; i < text.length; i++) {
    if (text[i] === '{') depth++;
    else if (text[i] === '}' && --depth === 0) return i;
  }
  return -1;
}

/** `=0 {...} one {...} other {...}` as a map from selector to branch text. */
function pluralBranches(text) {
  const branches = new Map();
  let i = 0;
  while (i < text.length) {
    const match = /\s*(=\d+|[a-z]+)\s*\{/y;
    match.lastIndex = i;
    const found = match.exec(text);
    if (!found) break;
    const open = match.lastIndex - 1;
    const close = closingBrace(text, open);
    if (close < 0) break;
    branches.set(found[1], text.slice(open + 1, close));
    i = close + 1;
  }
  return branches;
}

/** Replaces # with the count, outside nested braces only. */
function fillCount(text, count) {
  let depth = 0;
  let out = '';
  for (const char of text) {
    if (char === '{') depth++;
    if (char === '}') depth--;
    out += char === '#' && depth === 0 ? count : char;
  }
  return out;
}

/**
 * @param {string} message
 * @param {Record<string, unknown>} [params]
 * @param {string} locale A BCP 47 tag for the plural rules, such as en-US.
 * @returns {string}
 */
export function formatMessage(message, params = {}, locale) {
  let out = '';
  let i = 0;
  while (i < message.length) {
    const open = message.indexOf('{', i);
    if (open < 0) break;
    const close = closingBrace(message, open);
    if (close < 0) break;
    out += message.slice(i, open);
    const body = message.slice(open + 1, close);
    const plural = /^\s*(\w+)\s*,\s*plural\s*,([\s\S]*)$/.exec(body);
    if (plural) {
      const count = Number(params[plural[1]]);
      const branches = pluralBranches(plural[2]);
      const branch =
        branches.get(`=${count}`) ??
        branches.get(pluralCategory(locale, count)) ??
        branches.get('other') ??
        '';
      out += formatMessage(fillCount(branch, String(params[plural[1]])), params, locale);
    } else {
      const name = body.trim();
      out += Object.hasOwn(params, name) ? String(params[name]) : `{${body}}`;
    }
    i = close + 1;
  }
  return out + message.slice(i);
}
