import React from 'react';
import { APP_HIGHLIGHTS } from './downloadContent';

/** "Why install it" — the four things the app does better than the website. */
const AppHighlights: React.FC = () => (
  <section className="mx-auto max-w-6xl px-5 py-16 sm:px-8 sm:py-20" aria-labelledby="highlights-heading">
    <h2 id="highlights-heading" className="text-3xl font-bold tracking-tight text-gray-900 sm:text-4xl">
      Why people keep the app
    </h2>
    <p className="mt-3 max-w-2xl text-lg leading-relaxed text-gray-600">
      Everything on row-nel.com, plus the parts a website simply cannot do.
    </p>

    <div className="mt-10 grid gap-5 sm:grid-cols-2">
      {APP_HIGHLIGHTS.map(({ icon: Icon, title, body }) => (
        <article
          key={title}
          className="group rounded-2xl border border-gray-200 bg-white p-6 transition-all hover:border-brand-200 hover:shadow-lg hover:shadow-brand-500/5"
        >
          <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-brand-50 text-brand-700 transition-colors group-hover:bg-brand-100">
            <Icon className="h-5 w-5" />
          </span>
          <h3 className="mt-4 text-lg font-semibold text-gray-900">{title}</h3>
          <p className="mt-2 leading-relaxed text-gray-600">{body}</p>
        </article>
      ))}
    </div>
  </section>
);

export default AppHighlights;
