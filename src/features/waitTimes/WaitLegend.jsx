import { useId } from 'react';
import { colorIndex, NO_COUNT_CLASS, WAIT_COLOR_CLASSES } from './waitColors.js';
import { copy } from './waitTimesCopy.js';

const SWATCH = 'inline-block size-4 shrink-0 rounded-full border-2';

/**
 * The people-in-line legend of the wait times map (#104) and, on Election
 * Day, the precinct map (#107): one swatch per class of the counts shown now
 * (#172), with its range, then the plain marker of a place with no count.
 * @param {{ classes: { min: number, max: number }[] }} props From waitClasses.
 */
export default function WaitLegend({ classes }) {
  const id = useId();
  return (
    <div className="mt-2 text-sm">
      <p id={id} className="font-semibold">
        {copy.map.legend}
      </p>
      <ul aria-labelledby={id} className="mt-1 flex flex-wrap gap-x-4 gap-y-1">
        {classes.map((range, i) => (
          <li key={range.min} className="flex items-center gap-2">
            <span
              aria-hidden="true"
              className={`${SWATCH} ${WAIT_COLOR_CLASSES[colorIndex(i, classes.length)]}`}
            />
            {copy.map.bin(range)}
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
