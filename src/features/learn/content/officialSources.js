// Voter information in this app comes only from official sources. Every source
// and link in a learn topic must be an https URL on one of these hosts, checked
// at build time. Extend the list in a reviewed change, never per topic.

/** Any government host: federal, state and local sites use .gov. */
const GOV_SUFFIX = '.gov';

/** The St. Louis County Board of Election Commissioners' own sites, and their subdomains. */
const OFFICIAL_DOMAINS = ['stlouiscovotes.info'];

/** Single hosts the county board publishes on (its ArcGIS portal), exact match only. */
const OFFICIAL_HOSTS = ['stlouiscovotes.maps.arcgis.com'];

/**
 * True when `url` is an https URL on an official host, with no credentials or
 * port that could make it point somewhere else.
 * @param {string} url
 * @returns {boolean}
 */
export function isOfficialUrl(url) {
  // The URL parser forgives a missing // and backslashes; the source text must
  // be a plain https:// URL so it reads the same to a person and a browser.
  if (typeof url !== 'string' || !url.startsWith('https://') || url.includes('\\')) return false;
  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    return false;
  }
  if (parsed.protocol !== 'https:' || parsed.username || parsed.password || parsed.port) {
    return false;
  }
  const host = parsed.hostname;
  return (
    host.endsWith(GOV_SUFFIX) ||
    OFFICIAL_HOSTS.includes(host) ||
    OFFICIAL_DOMAINS.some((domain) => host === domain || host.endsWith(`.${domain}`))
  );
}
