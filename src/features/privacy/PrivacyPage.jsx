import { Link } from 'wouter';
import { copy } from './privacyCopy.js';

const linkClass = 'inline-flex min-h-11 items-center text-primary underline';

// The privacy notice (#20): what each service gets and what the site never keeps.
export default function PrivacyPage() {
  return (
    <>
      <h1 className="text-2xl font-semibold">{copy.heading}</h1>
      <p className="mt-4">{copy.intro}</p>

      <section aria-labelledby="privacy-never" className="mt-8">
        <h2 id="privacy-never" className="text-xl font-semibold">
          {copy.never.heading}
        </h2>
        <ul className="mt-2 list-disc space-y-2 pl-6">
          {copy.never.items.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="privacy-sent" className="mt-8">
        <h2 id="privacy-sent" className="text-xl font-semibold">
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
        <h2 id="privacy-links" className="text-xl font-semibold">
          {copy.links.heading}
        </h2>
        <p className="mt-2">{copy.links.text}</p>
      </section>

      <p className="mt-8">
        <Link href="/" className={linkClass}>
          {copy.backHome}
        </Link>
      </p>
    </>
  );
}
