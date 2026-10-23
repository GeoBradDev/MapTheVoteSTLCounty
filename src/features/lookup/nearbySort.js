// Stable row keys and the held order of a list a sort can reorder
// (NearbySortControls.jsx), shared by the early voting card (#105) and, on
// Election Day, the polling places card (#107).
import { useEffect, useRef, useState } from 'react';

/**
 * A key per row that stays the same when the rows are reordered or a count
 * changes, so a refresh never remounts the row that has focus. Rows that
 * share a location number and wait key get a running suffix, in the
 * nearest-first order the rows arrive in.
 * @template {{ loc: string | null }} T
 * @param {T[]} rows
 * @param {(row: T) => string | null} waitKeyOf
 * @returns {(T & { key: string })[]}
 */
export function withKeys(rows, waitKeyOf) {
  const seen = new Map();
  return rows.map((row) => {
    const base = `${row.loc}:${waitKeyOf(row)}`;
    const n = seen.get(base) ?? 0;
    seen.set(base, n + 1);
    return { ...row, key: n === 0 ? base : `${base}:${n}` };
  });
}

// The rows in the held order: rows it does not know go last, in their order.
function inHeldOrder(rows, held) {
  const rank = new Map(held.map((key, i) => [key, i]));
  const at = (row, i) => rank.get(row.key) ?? held.length + i;
  return rows
    .map((row, i) => [at(row, i), row])
    .sort((x, y) => x[0] - y[0])
    .map(([, row]) => row);
}

/**
 * The rows in the order shown when focus entered the list, while focus is in
 * it, so a refresh never moves (and so blurs) the focused row; the current
 * order applies once focus leaves (#27).
 * @template {{ key: string }} T
 * @param {T[] | null | undefined} ordered The rows in the current order.
 * @returns {{ rows: T[] | null | undefined, listRef: { current: HTMLElement | null },
 *   listProps: { onFocus: () => void, onBlur: (event: FocusEvent) => void } }}
 */
export function useHeldOrder(ordered) {
  const [held, setHeld] = useState(null);
  const listRef = useRef(null);
  const rows = held && ordered ? inHeldOrder(ordered, held) : ordered;
  // Focus can leave the list with no blur reaching it (the focused row was
  // removed, #84): when the rows change, let go of the held order if focus is
  // elsewhere.
  useEffect(() => {
    if (held && !listRef.current?.contains(document.activeElement)) setHeld(null);
  }, [held, ordered]);
  const listProps = {
    onFocus: () => setHeld((keys) => keys ?? (rows ?? []).map((row) => row.key)),
    onBlur: (event) => {
      // Focus moved outside the list. Not when the window lost focus: the row
      // link is then still the active element.
      const list = event.currentTarget;
      if (!list.contains(event.relatedTarget) && !list.contains(document.activeElement)) {
        setHeld(null);
      }
    },
  };
  return { rows, listRef, listProps };
}
