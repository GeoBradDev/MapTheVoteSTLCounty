// Helpers for the privacy notice tests (PrivacyPage.test.jsx and, with
// Google Analytics on, PrivacyPage.analytics.test.jsx, #69).
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { parse } from 'yaml';

const ROOT = path.resolve(import.meta.dirname, '../..');

/**
 * The connect-src origins render.yaml allows, other than 'self': every third
 * party the browser may send a request to.
 */
export async function connectOrigins() {
  const blueprint = parse(await readFile(path.join(ROOT, 'render.yaml'), 'utf8'));
  const csp = blueprint.services[0].headers.find(
    (rule) => rule.path === '/*' && rule.name === 'Content-Security-Policy',
  ).value;
  const directive = csp
    .split(';')
    .map((d) => d.trim().split(/\s+/))
    .find(([name]) => name === 'connect-src');
  return directive.slice(1).filter((source) => source !== "'self'");
}

/**
 * The host names `text` gives in parentheses. Whole names only, so a new
 * origin like arcgis.com is not passed by a longer name such as
 * services6.arcgis.com that contains it. A host may start with a wildcard
 * label (*.google-analytics.com, #69).
 * @param {string} text
 */
export function namedHosts(text) {
  return new Set([...text.matchAll(/\(((?:\*\.)?[a-z0-9.-]+\.[a-z]+)\)/g)].map((m) => m[1]));
}
