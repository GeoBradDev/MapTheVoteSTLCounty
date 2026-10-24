// What render.yaml's Content-Security-Policy must allow for Google Analytics
// (#69), and the check that it agrees with the measurement ID (#191, owner
// decision): no Google host while the ID is empty, as it ships, since
// www.googletagmanager.com can serve any Tag Manager container; every source
// below once it is set. src/analytics/csp.test.js runs the check on
// render.yaml, and scripts/smoke.mjs on a deploy's header. Not imported by
// the app.
import { ANALYTICS_HOSTS } from './index.js';

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

// A source naming a Google host or a wildcard under one: google.com,
// googletagmanager.com, google-analytics.com and their subdomains.
const GOOGLE_HOST =
  /^(?:[a-z][a-z0-9+.-]*:\/\/)?(?:[*a-z0-9-]+\.)*(?:google|googletagmanager|google-analytics)\.com(?::\d+|:\*)?(?:\/.*)?$/i;

function directives(policy) {
  return policy
    .split(';')
    .map((d) => d.trim().split(/\s+/))
    .filter(([name]) => name)
    .map(([name, ...values]) => [name.toLowerCase(), values]);
}

/**
 * The ways `policy` and `measurementId` disagree, each telling the owner what
 * to change in render.yaml; empty when they agree.
 * @param {string} policy A Content-Security-Policy header value.
 * @param {string} measurementId gaMeasurementId from src/config/site.js.
 * @returns {string[]}
 */
export function analyticsCspProblems(policy, measurementId) {
  const parsed = directives(policy);
  if (measurementId) {
    const csp = new Map(parsed);
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
          `gaMeasurementId is empty, so render.yaml's Content-Security-Policy must name no ` +
            `Google host: remove ${google.join(' ')} from ${name}`,
        ]
      : [];
  });
}
