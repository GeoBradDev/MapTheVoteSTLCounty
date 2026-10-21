// Checks every precinct's sample ballot link on the live layer with the app's
// own parser. Every `In Election` precinct must parse to a link that matches
// the election config's pattern, and every other precinct to a message. Layer
// paths come from the election config, so this works again next election.
// Usage: node scripts/check-sample-ballots.mjs
// Exits 1 and lists the failures when any precinct does not parse.

import election from '../src/config/election.js';
import { parseSampleBallot } from '../src/data/sampleBallot.js';

const url = `${election.serviceRoot}/${election.layers.precincts}/query?${new URLSearchParams({
  where: '1=1',
  outFields: 'precinct,in_election,html',
  returnGeometry: 'false',
  orderByFields: 'precinct',
  f: 'json',
})}`;

const res = await fetch(url);
if (!res.ok) throw new Error(`HTTP ${res.status} from ${url}`);
const body = await res.json();
if (body.error) throw new Error(`ArcGIS error: ${JSON.stringify(body.error)}`);
if (body.exceededTransferLimit) throw new Error('Too many precincts for one request: page it');

const counts = {};
const failures = [];
const urls = new Set();
const messages = new Set();

for (const { attributes } of body.features) {
  const { precinct, in_election: status, html } = attributes;
  const result = parseSampleBallot(html);
  const kind = 'url' in result ? 'link' : result.message ? 'message' : 'nothing';
  counts[`${status}: ${kind}`] = (counts[`${status}: ${kind}`] ?? 0) + 1;

  if (status === 'In Election') {
    if ((html?.match(/href/gi) ?? []).length > 1) failures.push(`${precinct}: several links`);
    else if (kind !== 'link')
      failures.push(`${precinct}: no valid link in ${JSON.stringify(html)}`);
    else if (!result.fileName) failures.push(`${precinct}: link has no file name`);
    else if (urls.has(result.url)) failures.push(`${precinct}: link shared with another precinct`);
    else urls.add(result.url);
  } else if (kind !== 'message') {
    failures.push(`${precinct} (${status}): expected a message, got ${JSON.stringify(result)}`);
  } else {
    messages.add(result.message);
  }
}

console.log(`${body.features.length} precincts from ${election.layers.precincts}`);
for (const [key, count] of Object.entries(counts).sort()) console.log(`  ${key}: ${count}`);
console.log(`${urls.size} distinct sample ballot links`);
for (const message of messages) {
  // Entities are not decoded; flag any so a change in the data is noticed.
  const note = message.includes('&') ? ' (contains &: check for HTML entities)' : '';
  console.log(`Message${note}: ${message}`);
}

if (urls.size === 0) failures.push('No In Election precinct has a link');

if (failures.length) {
  console.error(`\n${failures.length} failures:`);
  for (const failure of failures) console.error(`  ${failure}`);
  process.exit(1);
}
console.log('OK');
