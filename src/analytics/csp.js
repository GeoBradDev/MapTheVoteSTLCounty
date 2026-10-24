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

// A Google host: google.com (and country domains like google.co.uk), the tag,
// analytics, ad, static, API and user content domains, and their subdomains.
const GOOGLE_HOST =
  /^(?:[a-z0-9-]+\.)*(?:google(?:\.com?)?\.[a-z]{2,}|(?:googletagmanager|google-analytics|googleadservices|googlesyndication|googletagservices|googleapis|googleusercontent|doubleclick|gstatic)\.(?:com|net))$/i;

// Hosts a wildcard source is tried against: one per Google domain above, as
// a browser would request it (*.com and *.co.uk allow some of them). Only
// two country domains are sampled, so *.de is not caught here.
const GOOGLE_SAMPLES = [
  'www.googletagmanager.com',
  'region1.google-analytics.com',
  'www.google.com',
  'www.google.co.uk',
  'www.google.com.au',
  'www.googleadservices.com',
  'pagead2.googlesyndication.com',
  'www.googletagservices.com',
  'www.googleapis.com',
  'lh3.googleusercontent.com',
  'stats.g.doubleclick.net',
  'ssl.gstatic.com',
];

// A CSP host source: an optional scheme, a host (or none, for a scheme
// alone like https:), an optional port and an optional path.
const SOURCE = /^(?:([a-z][a-z0-9+.-]*):(?:\/\/|$))?([^/:]*)(?::(?:\d+|\*))?(?:\/.*)?$/i;

/**
 * Whether a source lets the page reach a Google host: a Google host itself,
 * a wildcard that covers one (*, *.com), or a network scheme alone (https:).
 */
function allowsGoogle(source) {
  if (source.startsWith("'")) return false;
  const match = source.match(SOURCE);
  if (!match) return false;
  const [, scheme, rawHost] = match;
  const host = rawHost.toLowerCase().replace(/\.$/, '');
  if (!host) return /^(?:https?|wss?)$/i.test(scheme ?? '');
  if (host === '*') return true;
  // *.X covers X's subdomains: Google's, when X is a Google host or a
  // suffix of one (com, co.uk).
  if (host.startsWith('*.')) {
    const suffix = host.slice(2);
    return (
      GOOGLE_HOST.test(suffix) || GOOGLE_SAMPLES.some((google) => google.endsWith(`.${suffix}`))
    );
  }
  return GOOGLE_HOST.test(host);
}

// The directives a browser applies to each of GA's requests, most specific
// first: script-src-elem governs a script tag over script-src, and
// default-src stands in for any the policy leaves out.
const APPLIED = Object.freeze({
  'script-src': ['script-src-elem', 'script-src', 'default-src'],
  'connect-src': ['connect-src', 'default-src'],
  'img-src': ['img-src', 'default-src'],
});

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
    return Object.entries(ANALYTICS_CSP).flatMap(([directive, sources]) => {
      const name = APPLIED[directive].find((candidate) => csp.has(candidate));
      // No directive applies: the policy does not restrict these requests.
      if (!name) return [];
      const missing = sources.filter((source) => !csp.get(name).includes(source));
      return missing.length
        ? [
            `gaMeasurementId is set (${measurementId}), so Google Analytics needs render.yaml's ` +
              `Content-Security-Policy to allow its hosts: add ${missing.join(' ')} to ${name}`,
          ]
        : [];
    });
  }
  return parsed.flatMap(([name, values]) => {
    const google = values.filter(allowsGoogle);
    return google.length
      ? [
          `gaMeasurementId is empty (or not a GA4 ID), so render.yaml's Content-Security-Policy must allow no ` +
            `Google host: remove ${google.join(' ')} from ${name}`,
        ]
      : [];
  });
}
