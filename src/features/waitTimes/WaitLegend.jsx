import { useId } from 'react';
import { WAIT_BINS } from './siteOrder.js';
import { NO_COUNT_CLASS, WAIT_BIN_CLASSES } from './waitColors.js';
import { copy } from './waitTimesCopy.js';

const SWATCH = 'inline-block size-4 shrink-0 rounded-full border-2';

/**
 * The people-in-line legend of the wait times map (#104) and, on Election
 * Day, the precinct map (#107): one swatch per fixed bin, then the plain
 * marker of a place with no count.
 */
export default function WaitLegend() {
  const id = useId();
  return (
    <div className="mt-2 text-sm">
      <p id={id} className="font-semibold">
        {copy.map.legend}
      </p>
      <ul aria-labelledby={id} className="mt-1 flex flex-wrap gap-x-4 gap-y-1">
        {WAIT_BINS.map((bin, i) => (
          <li key={bin.min} className="flex items-center gap-2">
            <span aria-hidden="true" className={`${SWATCH} ${WAIT_BIN_CLASSES[i]}`} />
            {copy.map.bin(bin)}
          </li>
        ))}
        <li className="flex items-center gap-2">
          <span aria-hidden="true" className={`${SWATCH} ${NO_COUNT_CLASS}`} />
          {copy.map.noCount}
        </li>
      </ul>
    </div>
  );
}
