// The room inside each County polling place and early voting site (#100),
// from the St. Louis County Board of Elections' polling place dashboard view
// (owner decision, 2026-10-23: shown, labeled as the board's data). The City's
// sites carry their own entrance notes instead (#89). No React here: the data
// health check (scripts/check-config.mjs) reads the same index; the cards'
// hook is in ./usePollRooms.js.
import election from '../../config/election.js';
import { caseWord } from './nearbyPolls.js';

// Kept with the word, cased on each side: FOYER/HALLWAY, A&B, (LOWER LEVEL).
const SEPARATOR = /([/&+()"])/;
// Two-letter words, not room letters like AB or codes like RM.
const SHORT_WORDS = new Set(['AN', 'AT', 'DE', 'IN', 'OF', 'ON', 'TO']);

function casePart(part, first) {
  if (!/[a-z]/i.test(part)) return part;
  const upper = part.toUpperCase();
  // Ordinals: 2ND.
  if (/^\d+(ST|ND|RD|TH)$/.test(upper)) return upper.toLowerCase();
  // Room codes and letters stay as written: MP1, HS109A, GYM A, ROOM AB.
  if (/\d/.test(part) || (/^[A-Z]{1,2}$/.test(upper) && !SHORT_WORDS.has(upper))) return upper;
  return caseWord(part, first);
}

/**
 * A room name in careful title case: "GYM LOBBY" reads "Gym Lobby", and room
 * letters and codes stay upper case ("EVENT SPACE A + B", "ROOM HS109A").
 * @param {unknown} text
 * @returns {string | null} Null when there is no text.
 */
export function roomCase(text) {
  if (typeof text !== 'string') return null;
  const words = text.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return null;
  return words
    .map((word, i) =>
      word
        .split(SEPARATOR)
        .map((part, j) => casePart(part, i === 0 && j === 0))
        .join(''),
    )
    .join(' ');
}

// A location number as the polls layer writes it: 7 or "7" is "007".
function locationKey(value) {
  const text = typeof value === 'number' ? String(value) : value;
  if (typeof text !== 'string' || !/^\d+$/.test(text.trim())) return null;
  return text.trim().padStart(3, '0');
}

/**
 * @typedef {{ electionDay: Map<string, string>, absentee: Map<string, string> }} RoomIndex
 *   Rooms by the polls layer's `loc` (Election Day) and `loc_abs` (early voting).
 */

/**
 * The rooms of the room layer, by location number. A row with no room, a bad
 * location number or another kind is left out, and so is a location whose
 * rows name different rooms: the card then shows no room, never a wrong one.
 * @param {{ features?: object[] } | undefined} collection From getPollRooms().
 * @returns {RoomIndex}
 */
export function roomIndex(collection) {
  const { fields, electionDay, absentee } = election.pollRooms;
  const index = { electionDay: new Map(), absentee: new Map() };
  const byKind = new Map([
    [electionDay, index.electionDay],
    [absentee, index.absentee],
  ]);
  const conflicts = [];
  for (const feature of collection?.features ?? []) {
    const props = feature?.properties;
    const rooms = props && byKind.get(props[fields.kind]);
    const key = rooms && locationKey(props[fields.id]);
    const room = key && roomCase(props[fields.room]);
    if (!room) continue;
    if (rooms.has(key) && rooms.get(key) !== room) conflicts.push([rooms, key]);
    rooms.set(key, room);
  }
  for (const [rooms, key] of conflicts) rooms.delete(key);
  return index;
}
