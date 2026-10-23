// The "Nearest first" or "Shortest line within N miles" sort, shared by the
// early voting card (#105) and, on Election Day, the polling places card
// (#107). A sort is a sort, not advice.
import { useId } from 'react';
import { NEARBY_MILES } from '../waitTimes/siteOrder.js';
import { copy as waitCopy } from '../waitTimes/waitTimesCopy.js';
import { copy } from './resultsCopy.js';

/**
 * The two sort radios.
 * @param {{ sort: 'nearest' | 'nearby', onSort: (sort: 'nearest' | 'nearby') => void }} props
 */
export default function NearbySortControls({ sort, onSort }) {
  const id = useId();
  const options = [
    ['nearest', copy.earlyVoting.waits.nearest],
    ['nearby', waitCopy.sort.nearby(NEARBY_MILES)],
  ];
  return (
    <fieldset role="radiogroup" aria-labelledby={`${id}-legend`} className="mt-3">
      <legend id={`${id}-legend`} className="font-semibold">
        {waitCopy.sort.legend}
      </legend>
      <div className="mt-1 flex flex-col">
        {options.map(([value, label]) => (
          <label key={value} className="flex min-h-11 items-center gap-3">
            <input
              type="radio"
              name={`${id}-sort`}
              value={value}
              checked={sort === value}
              onChange={() => onSort(value)}
              className="size-5 accent-primary"
            />
            {label}
          </label>
        ))}
      </div>
    </fieldset>
  );
}
