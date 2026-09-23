import { Link } from 'react-router-dom';
import { ACCOUNT_DELETION_SECTIONS, PRIVACY_CONTACT_EMAIL } from './legalContent';
import LegalSectionBlock from './LegalSectionBlock';

export default function DeleteAccount() {
  return (
    <main className="min-h-screen bg-white px-5 pb-24 pt-8 sm:px-8">
      <div className="mx-auto max-w-2xl">
        <Link to="/" className="text-sm font-medium text-brand-600 hover:text-brand-700">
          &larr; Back to Row-Nel
        </Link>

        <h1 className="mt-6 text-3xl font-bold tracking-tight text-gray-900">Delete your Row-Nel account</h1>
        <p className="mt-3 leading-relaxed text-gray-700">
          You can delete your Row-Nel Food Delivery account and its personal data at any time, from the app, the
          website, or by emailing{' '}
          <a
            href={`mailto:${PRIVACY_CONTACT_EMAIL}`}
            className="font-medium text-brand-600 underline hover:text-brand-700"
          >
            {PRIVACY_CONTACT_EMAIL}
          </a>
          .
        </p>

        {ACCOUNT_DELETION_SECTIONS.map((section) => (
          <LegalSectionBlock key={section.heading} section={section} />
        ))}
      </div>
    </main>
  );
}
