// What render.yaml's Content-Security-Policy must allow for Google Analytics
// (#69), and the check that it agrees with the measurement ID (#191, owner
// decision): no Google host while the ID is empty, as it ships, since
// www.googletagmanager.com can serve any Tag Manager container; every source
// below once it is set. src/analytics/csp.test.js runs the check on
// render.yaml, and scripts/smoke.mjs on a deploy's header. Not imported by
// the app.
import { ANALYTICS_HOSTS, analyticsEnabled } from './index.js';

const LOADER = `https://${ANALYTICS_HOSTS.loader}`;
const COLLECTOR = `https://${ANALYTICS_HOSTS.collector}`;

/**
 * The sources GA needs, by directive: gtag.js from its loader, and page views
 * sent to the collector by fetch or beacon (connect-src) or as an image
 * (img-src, its fallback). The loader is in connect-src too, as Google
 * documents for GA4.
 */
export const ANALYTICS_CSP = Object.freeze({
  'script-src': [LOADER],
  'connect-src': [LOADER, COLLECTOR],
  'img-src': [COLLECTOR],
});

// A source naming a Google host or a wildcard under one: google.com (and
// country domains like google.co.uk), the tag, analytics, ad and static
// domains GA and Tag Manager use, and their subdomains, with or without a
// trailing dot.
const GOOGLE_HOST =
  /^(?:[a-z][a-z0-9+.-]*:\/\/)?(?:[*a-z0-9-]+\.)*(?:google(?:\.com?)?\.[a-z]{2,}|(?:googletagmanager|google-analytics|googleadservices|googlesyndication|doubleclick|gstatic)\.(?:com|net))\.?(?::\d+|:\*)?(?:\/.*)?$/i;

function directives(policy) {
  return policy
    .split(';')
    .map((d) => d.trim().split(/\s+/))
    .filter(([name]) => name)
    .map(([name, ...values]) => [name.toLowerCase(), values]);
}

/**
 * The ways `policy` and `measurementId` disagree, each telling the owner what
 * to change in render.yaml; empty when they agree. The ID counts as set only
 * when GA would load with it (analyticsEnabled: a GA4 ID like G-ABC123DEF4).
 * @param {string} policy A Content-Security-Policy header value.
 * @param {string} measurementId gaMeasurementId from src/config/site.js.
 * @returns {string[]}
 */
export function analyticsCspProblems(policy, measurementId) {
  const parsed = directives(policy);
  if (analyticsEnabled(measurementId)) {
    // The first copy of each directive: a browser ignores later ones.
    const csp = new Map(parsed.toReversed());
    return Object.entries(ANALYTICS_CSP).flatMap(([name, sources]) => {
      const missing = sources.filter((source) => !(csp.get(name) ?? []).includes(source));
      return missing.length
        ? [
            `gaMeasurementId is set (${measurementId}), so Google Analytics needs render.yaml's ` +
              `Content-Security-Policy to allow its hosts: add ${missing.join(' ')} to ${name}`,
          ]
        : [];
    });
  }
  return parsed.flatMap(([name, values]) => {
    const google = values.filter((source) => GOOGLE_HOST.test(source));
    return google.length
      ? [
          `gaMeasurementId is empty (or not a GA4 ID), so render.yaml's Content-Security-Policy must name no ` +
            `Google host: remove ${google.join(' ')} from ${name}`,
        ]
      : [];
  });
}
