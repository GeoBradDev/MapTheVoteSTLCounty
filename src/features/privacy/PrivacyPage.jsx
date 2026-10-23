import { useEffect, useRef } from 'react';
import TextLink from '../../components/TextLink.jsx';
import { usePageTitle } from '../../components/usePageTitle.js';
import { copy } from './privacyCopy.js';
import { focusHeadingOnArrival } from '../../hydrate.js';

// The privacy notice (#20): what each service gets and what the site never keeps.
export default function PrivacyPage() {
  const headingRef = useRef(null);
  usePageTitle(copy.heading);

  // The footer link stays mounted and sits at the bottom of the page, so move
  // focus (and with it the scroll position) to the notice's heading on arrival.
  useEffect(() => {
    focusHeadingOnArrival(headingRef.current);
  }, []);

  return (
    <>
      <h1 ref={headingRef} tabIndex={-1} className="text-title font-bold">
        {copy.heading}
      </h1>
      <p className="mt-4">{copy.intro}</p>

      <section aria-labelledby="privacy-never" className="mt-8">
        <h2 id="privacy-never" className="text-heading font-semibold">
          {copy.never.heading}
        </h2>
        <ul className="mt-2 list-disc space-y-2 pl-6">
          {copy.never.items.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="privacy-sent" className="mt-8">
        <h2 id="privacy-sent" className="text-heading font-semibold">
          {copy.sent.heading}
        </h2>
        <p className="mt-2">{copy.sent.intro}</p>
        {copy.sent.items.map((item) => (
          <div key={item.heading} className="mt-4">
            <h3 className="font-semibold">{item.heading}</h3>
            <p className="mt-1">{item.text}</p>
          </div>
        ))}
      </section>

      <section aria-labelledby="privacy-links" className="mt-8">
        <h2 id="privacy-links" className="text-heading font-semibold">
          {copy.links.heading}
        </h2>
        <p className="mt-2">{copy.links.text}</p>
      </section>

      <p className="mt-8">
        <TextLink to="/" variant="tap">
          {copy.backHome}
        </TextLink>
      </p>
    </>
  );
}
