// The cards' hook for the polling place rooms (#100); ./pollRooms.js has the index.
import { useEffect, useState } from 'react';
import { useJurisdiction } from './jurisdictionContext.js';
import { roomIndex } from './pollRooms.js';

// One index per loaded layer answer, so a card refresh that gets the shared
// answer back keeps the same Maps.
const indexes = new WeakMap();

function indexOf(collection) {
  if (!indexes.has(collection)) indexes.set(collection, roomIndex(collection));
  return indexes.get(collection);
}

/**
 * The rooms of one kind for the jurisdiction's sites, or null until they
 * load, when they fail, or when the jurisdiction has none (the City). Asked
 * for on mount, beside the card's own list request, and again when
 * `refreshKey` changes (the shared layer answers from memory while fresh,
 * #84). A failure keeps the rooms already shown and never reaches the card.
 * @param {'electionDay' | 'absentee'} kind
 * @param {unknown} refreshKey Changes when the card's list reloads.
 * @returns {Map<string, string> | null}
 */
export function usePollRooms(kind, refreshKey) {
  const { getPollRooms } = useJurisdiction();
  const [loaded, setLoaded] = useState(null);
  useEffect(() => {
    if (!getPollRooms) return undefined;
    let current = true;
    // Asked for now, in the same commit as the card's list. A throw or a
    // rejection is dropped: the rooms never reach the card.
    let request;
    try {
      request = Promise.resolve(getPollRooms());
    } catch {
      return undefined;
    }
    request.then(
      (collection) => {
        if (current) setLoaded({ getPollRooms, index: indexOf(collection) });
      },
      () => {},
    );
    return () => {
      current = false;
    };
  }, [getPollRooms, refreshKey]);
  // Rooms loaded for another jurisdiction never show.
  return loaded && loaded.getPollRooms === getPollRooms ? loaded.index[kind] : null;
}
