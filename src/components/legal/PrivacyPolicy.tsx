import { Link } from 'react-router-dom';
import {
  PRIVACY_CONTACT_EMAIL,
  PRIVACY_LAST_UPDATED,
  PRIVACY_SECTIONS,
} from './legalContent';
import LegalSectionBlock from './LegalSectionBlock';

export default function PrivacyPolicy() {
  return (
    <main className="min-h-screen bg-white px-5 pb-24 pt-8 sm:px-8">
      <div className="mx-auto max-w-2xl">
        <Link to="/" className="text-sm font-medium text-brand-600 hover:text-brand-700">
          &larr; Back to Row-Nel
        </Link>

        <h1 className="mt-6 text-3xl font-bold tracking-tight text-gray-900">Privacy Policy</h1>
        <p className="mt-2 text-sm text-gray-500">Last updated {PRIVACY_LAST_UPDATED}</p>

        {PRIVACY_SECTIONS.map((section) => (
          <LegalSectionBlock key={section.heading} section={section} />
        ))}

        <section className="mt-8">
          <h2 className="text-xl font-semibold text-gray-900">Contact us</h2>
          <p className="mt-3 leading-relaxed text-gray-700">
            For any question about this policy, or to exercise any of the rights described above, email us at{' '}
            <a
              href={`mailto:${PRIVACY_CONTACT_EMAIL}`}
              className="font-medium text-brand-600 underline hover:text-brand-700"
            >
              {PRIVACY_CONTACT_EMAIL}
            </a>
            .
          </p>
        </section>
      </div>
    </main>
  );
}
