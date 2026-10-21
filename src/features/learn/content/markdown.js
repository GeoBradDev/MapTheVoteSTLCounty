// A small, strict Markdown subset for voter education topics (#21). It runs at
// build time only (from the Vite plugin) and turns a topic body into a JSON node
// tree that TopicArticle renders with React, so no HTML string ever reaches the
// page. Anything outside the subset is an error rather than a guess, so a typo
// cannot quietly render as something else.
//
// Blocks: paragraphs, `##` and `###` headings, `- ` and `1. ` lists (one level;
// indent continuation lines). Inline: `**bold**`, `[text](url)`, and `[^id]`,
// a citation of the front matter source with that id.

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
const ORDERED_ITEM = /^\d+\. (.*)$/;
const OTHER_LIST_MARKER = /^[*+] /;
const RULE = /^(?:-{3,}|\*{3,}|_{3,})\s*$/;
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

    if (ch === '<' && /^<[A-Za-z/!?]/.test(rest)) {
      fail('raw HTML is not allowed');
      return nodes;
    }
    if (ch === '`') {
      fail('code is not supported');
      return nodes;
    }
    if (rest.startsWith('![')) {
      fail('images are not supported');
      return nodes;
    }
    if (rest.startsWith('**')) {
      if (inStrong) {
        fail('bold cannot be nested');
        return nodes;
      }
      const end = source.indexOf('**', i + 2);
      if (end === -1 || end === i + 2) {
        fail('a ** has no closing **');
        return nodes;
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
      return nodes;
    }
    if (ch === '[') {
      const citation = CITATION.exec(rest);
      if (citation) {
        const id = citation[1];
        if (!ID_PATTERN.test(id)) {
          fail(`citation [^${id}] must name a source id like sos-voter-id`);
          return nodes;
        }
        if (source[i + citation[0].length] === ':') {
          fail(`[^${id}]: footnote definitions are not used; list sources in the front matter`);
          return nodes;
        }
        if (inLink) {
          fail('a citation cannot sit inside link text');
          return nodes;
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
          return nodes;
        }
        flush();
        const children = parseInline(label, where, errors, ctx, { inLink: true, inStrong });
        nodes.push({ type: 'link', href, children });
        ctx.links.push(href);
        i += whole.length;
        continue;
      }
      fail('a [ must start a link [text](url) or a citation [^source-id]');
      return nodes;
    }
    if (ch === ']') {
      fail('a ] has no matching [');
      return nodes;
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
      open.items.at(-1).lines.push(trimmed);
      return;
    }

    if (RULE.test(line)) {
      close();
      errors.push(`${where}: horizontal rules are not supported`);
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
      } else {
        blocks.push({ type: 'heading', level, children: parseInline(content, where, errors, ctx) });
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
      open.items.push({ line: lineNo, lines: [(unordered || ordered)[1].trim()] });
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
  return { blocks, citations: ctx.citations, links: ctx.links, errors };
}
