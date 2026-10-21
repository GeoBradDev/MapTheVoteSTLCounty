// A small, strict Markdown subset for voter education topics (#21). It runs at
// build time only (from the Vite plugin) and turns a topic body into a JSON node
// tree that TopicArticle renders with React, so no HTML string ever reaches the
// page. Anything outside the subset is an error rather than a guess, so a typo
// cannot quietly render as something else.
//
// Blocks: paragraphs, `##` and `###` headings (a `###` only after a `##`; text
// and bold only), `- ` and `1. ` lists (one level; indent continuation lines).
// Inline: `**bold**`, `[text](url)`, and `[^id]`, a citation of the front
// matter source with that id.

/**
 * @typedef {{ type: 'text', value: string }
 *   | { type: 'strong', children: InlineNode[] }
 *   | { type: 'link', href: string, children: InlineNode[] }
 *   | { type: 'cite', source: string }} InlineNode
 * @typedef {{ type: 'paragraph', children: InlineNode[] }
 *   | { type: 'heading', level: 2 | 3, children: InlineNode[] }
 *   | { type: 'list', ordered: boolean, items: InlineNode[][] }} BlockNode
 */

/** A source or citation id: lowercase words joined by hyphens. */
export const ID_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

const HEADING = /^(#+)(\s+|$)(.*)$/;
const UNORDERED_ITEM = /^- (.*)$/;
const ORDERED_ITEM = /^(\d+)\. (.*)$/;
const SETEXT_UNDERLINE = /^=+\s*$/;
const OTHER_LIST_MARKER = /^(?:[*+]\s|\d+\)\s|-\t|\d+\.\t)/;
const EMPTY_ITEM = /^(?:-|\d+[.)])$/;
// Lines that would mean something else in Markdown; never list item text.
const BLOCK_SYNTAX = /^(?:#{1,6}(?:\s|$)|>|```|~~~|\||[-*+] |\d+[.)] |(?:-|\d+[.)])$)/;
// Lines of only dashes (a rule or a setext underline) and spaced rules.
const RULE = /^(?:-+|(?:\*\s*){3,}|(?:_\s*){3,}|(?:-\s*){3,})$/;
/** Characters that are invisible or change text direction, so text reads
 * differently from how it is stored. */
export const HIDDEN_CHARACTER = /[\u061C\u200B-\u200F\u202A-\u202E\u2060\u2066-\u2069\uFEFF]/;
const CITATION = /^\[\^([^\]]*)\]/;
const LINK = /^\[([^\]]*)\]\(([^)\s]*)\)/;

/**
 * Parses inline text. Pushes problems to `errors`, prefixed with `where`.
 * @returns {InlineNode[]}
 */
function parseInline(source, where, errors, ctx, { inLink = false, inStrong = false } = {}) {
  const nodes = [];
  let buffer = '';
  const flush = () => {
    if (buffer) nodes.push({ type: 'text', value: buffer });
    buffer = '';
  };
  const fail = (message) => errors.push(`${where}: ${message}`);

  let i = 0;
  while (i < source.length) {
    const rest = source.slice(i);
    const ch = source[i];

    // After a problem, skip past it and keep reading, so one build lists
    // every problem in the text.
    if (ch === '<' && /^<[A-Za-z/!?]/.test(rest)) {
      fail('raw HTML is not allowed');
      i += 1;
      continue;
    }
    if (ch === '`') {
      fail('code is not supported');
      i += 1;
      continue;
    }
    if (rest.startsWith('![')) {
      fail('images are not supported');
      i += 1;
      continue;
    }
    if (rest.startsWith('**')) {
      const end = source.indexOf('**', i + 2);
      if (inStrong) {
        fail('bold cannot be nested');
        i += 2;
        continue;
      }
      if (end === -1 || end === i + 2) {
        fail('a ** has no closing **');
        i += 2;
        continue;
      }
      flush();
      const children = parseInline(source.slice(i + 2, end), where, errors, ctx, {
        inLink,
        inStrong: true,
      });
      nodes.push({ type: 'strong', children });
      i = end + 2;
      continue;
    }
    if (ch === '*') {
      fail('use **bold**; single * emphasis is not supported');
      i += 1;
      continue;
    }
    if (ch === '[') {
      const citation = CITATION.exec(rest);
      if (citation) {
        const id = citation[1];
        const skip = citation[0].length;
        if (!ID_PATTERN.test(id)) {
          fail(`citation [^${id}] must name a source id like sos-voter-id`);
          i += skip;
          continue;
        }
        if (source[i + skip] === ':') {
          fail(`[^${id}]: footnote definitions are not used; list sources in the front matter`);
          i += skip + 1;
          continue;
        }
        if (inLink) {
          fail('a citation cannot sit inside link text');
          i += skip;
          continue;
        }
        flush();
        nodes.push({ type: 'cite', source: id });
        ctx.citations.push(id);
        i += citation[0].length;
        continue;
      }
      const link = LINK.exec(rest);
      if (link && !inLink) {
        const [whole, label, href] = link;
        if (!label.trim() || !href) {
          fail('a link needs both text and a URL: [text](https://...)');
          i += whole.length;
          continue;
        }
        if (href.includes('(')) {
          fail(`write ( and ) in a link URL as %28 and %29: ${href}`);
          i += whole.length;
          continue;
        }
        flush();
        const children = parseInline(label, where, errors, ctx, { inLink: true, inStrong });
        nodes.push({ type: 'link', href, children });
        ctx.links.push(href);
        i += whole.length;
        continue;
      }
      fail('a [ must start a link [text](url) or a citation [^source-id]');
      i += 1;
      continue;
    }
    if (ch === ']') {
      fail('a ] has no matching [');
      i += 1;
      continue;
    }
    buffer += ch;
    i += 1;
  }
  flush();
  return nodes;
}

/**
 * Parses a topic body.
 * @param {string} body Markdown after the front matter.
 * @param {number} [firstLine=1] The file line number of the body's first line,
 *   so problems point at the right line of the file.
 * @returns {{ blocks: BlockNode[], citations: string[], links: string[], errors: string[] }}
 */
export function parseMarkdown(body, firstLine = 1) {
  const ctx = { citations: [], links: [] };
  const errors = [];
  const blocks = [];
  const lines = body.replace(/\r\n?/g, '\n').split('\n');

  // The block being collected: a paragraph's lines, or a list's items.
  let open = null;
  const close = () => {
    if (!open) return;
    const where = `line ${open.line}`;
    if (open.type === 'paragraph') {
      const children = parseInline(open.lines.join(' '), where, errors, ctx);
      blocks.push({ type: 'paragraph', children });
    } else {
      const items = open.items.map((item) =>
        parseInline(item.lines.join(' '), `line ${item.line}`, errors, ctx),
      );
      blocks.push({ type: 'list', ordered: open.ordered, items });
    }
    open = null;
  };

  lines.forEach((raw, index) => {
    const lineNo = firstLine + index;
    const where = `line ${lineNo}`;
    const line = raw.trimEnd();

    if (!line.trim()) {
      close();
      return;
    }

    if (HIDDEN_CHARACTER.test(line)) {
      errors.push(`${where}: remove the invisible or text direction control character`);
    }

    const indented = /^\s/.test(line);
    const trimmed = line.trim();

    if (indented) {
      if (open?.type !== 'list') {
        errors.push(`${where}: an indented line must continue a list item`);
        return;
      }
      if (UNORDERED_ITEM.test(trimmed) || ORDERED_ITEM.test(trimmed)) {
        errors.push(`${where}: nested lists are not supported`);
        return;
      }
      if (BLOCK_SYNTAX.test(trimmed) || SETEXT_UNDERLINE.test(trimmed)) {
        errors.push(`${where}: a list item can hold only text`);
        return;
      }
      open.items.at(-1).lines.push(trimmed);
      return;
    }

    if (SETEXT_UNDERLINE.test(line)) {
      close();
      errors.push(`${where}: underlined headings are not supported; use ## or ###`);
      return;
    }
    if (RULE.test(line)) {
      close();
      errors.push(`${where}: rules and underlined headings are not supported; use ## or ###`);
      return;
    }
    if (line.startsWith('>')) {
      close();
      errors.push(`${where}: blockquotes are not supported`);
      return;
    }
    if (line.startsWith('```') || line.startsWith('~~~')) {
      close();
      errors.push(`${where}: code blocks are not supported`);
      return;
    }
    if (line.startsWith('|')) {
      close();
      errors.push(`${where}: tables are not supported`);
      return;
    }
    if (EMPTY_ITEM.test(line)) {
      close();
      errors.push(`${where}: a list item needs text`);
      return;
    }
    if (OTHER_LIST_MARKER.test(line)) {
      close();
      errors.push(`${where}: start list items with "- " or "1. "`);
      return;
    }

    const heading = HEADING.exec(line);
    if (heading) {
      close();
      const level = heading[1].length;
      const content = heading[3].trim();
      if (level !== 2 && level !== 3) {
        errors.push(
          `${where}: use ## or ### headings (the title comes from the front matter, so no #)`,
        );
      } else if (!heading[2] || !content) {
        errors.push(`${where}: a heading needs text after a space`);
      } else if (level === 3 && !blocks.some((b) => b.type === 'heading' && b.level === 2)) {
        // The page's title is the h1, so an h3 first would skip a level.
        errors.push(`${where}: a ### heading must come after a ## heading`);
      } else {
        const children = parseInline(content, where, errors, ctx);
        // A long section's heading is its <details> toggle (#23), where a link
        // would be a control inside a control.
        const hasLink = (nodes) =>
          nodes.some((n) => n.type === 'link' || n.type === 'cite' || hasLink(n.children ?? []));
        if (hasLink(children)) {
          errors.push(`${where}: a heading can hold only text and bold, not links or citations`);
        }
        blocks.push({ type: 'heading', level, children });
      }
      return;
    }

    const unordered = UNORDERED_ITEM.exec(line);
    const ordered = ORDERED_ITEM.exec(line);
    if (unordered || ordered) {
      const isOrdered = Boolean(ordered);
      if (open?.type !== 'list' || open.ordered !== isOrdered) {
        close();
        open = { type: 'list', ordered: isOrdered, line: lineNo, items: [] };
      }
      // The page numbers ordered items itself, from 1. A written number that
      // would show differently (a list split by blank lines, a skipped or
      // restarted number) is an error, so a step number cannot silently change.
      if (isOrdered && Number(ordered[1]) !== open.items.length + 1) {
        errors.push(
          `${where}: number ordered items 1, 2, 3 in order, with no blank lines between them`,
        );
      }
      const itemText = (unordered ? unordered[1] : ordered[2]).trim();
      if (BLOCK_SYNTAX.test(itemText)) {
        errors.push(`${where}: a list item can hold only text`);
      }
      open.items.push({ line: lineNo, lines: [itemText] });
      return;
    }

    if (open?.type === 'list') {
      close();
      errors.push(`${where}: put a blank line between a list and the paragraph after it`);
      return;
    }
    if (!open) open = { type: 'paragraph', line: lineNo, lines: [] };
    open.lines.push(trimmed);
  });
  close();

  if (!blocks.length && !errors.length) errors.push('the topic has no body text');
  return { blocks, citations: ctx.citations, links: ctx.links, errors: [...new Set(errors)] };
}
