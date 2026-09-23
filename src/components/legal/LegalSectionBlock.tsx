import type { LegalSection } from './legalContent';

export default function LegalSectionBlock({ section }: { section: LegalSection }) {
  return (
    <section className="mt-8">
      <h2 className="text-xl font-semibold text-gray-900">{section.heading}</h2>

      {section.paragraphs?.map((paragraph) => (
        <p key={paragraph} className="mt-3 leading-relaxed text-gray-700">
          {paragraph}
        </p>
      ))}

      {section.bullets && (
        <ul className="mt-3 space-y-2">
          {section.bullets.map((bullet) => (
            <li key={bullet} className="flex gap-3 leading-relaxed text-gray-700">
              <span aria-hidden="true" className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-brand-500" />
              <span>{bullet}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
