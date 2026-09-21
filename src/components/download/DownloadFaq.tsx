import React from 'react';
import { ChevronDown } from 'lucide-react';
import { DOWNLOAD_FAQ } from './downloadContent';

/**
 * Native <details> accordions: keyboard accessible and findable with the
 * browser's own in-page search, with no state to manage.
 */
const DownloadFaq: React.FC = () => (
  <section className="bg-gray-100/70 py-16 sm:py-20" aria-labelledby="faq-heading">
    <div className="mx-auto max-w-6xl px-5 sm:px-8">
      <h2 id="faq-heading" className="text-3xl font-bold tracking-tight text-gray-900 sm:text-4xl">
        Questions people ask
      </h2>

      <div className="mt-8 max-w-3xl divide-y divide-gray-200 overflow-hidden rounded-2xl border border-gray-200 bg-white">
        {DOWNLOAD_FAQ.map(({ question, answer }) => (
          <details key={question} className="group">
            <summary className="flex cursor-pointer list-none items-center justify-between gap-4 px-5 py-4 font-semibold text-gray-900 transition-colors hover:bg-gray-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand-500">
              {question}
              <ChevronDown className="h-5 w-5 flex-shrink-0 text-gray-400 transition-transform group-open:rotate-180" />
            </summary>
            <p className="px-5 pb-5 leading-relaxed text-gray-600">{answer}</p>
          </details>
        ))}
      </div>
    </div>
  </section>
);

export default DownloadFaq;
