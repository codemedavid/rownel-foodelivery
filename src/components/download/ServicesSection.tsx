import React from 'react';
import { SERVICES } from '../../lib/services';

/**
 * The full service list, read straight from the app's own definitions so this
 * page can never drift from what Row-Nel actually offers.
 */
const ServicesSection: React.FC = () => (
  <section className="bg-gray-100/70 py-16 sm:py-20" aria-labelledby="services-heading">
    <div className="mx-auto max-w-6xl px-5 sm:px-8">
      <h2 id="services-heading" className="text-3xl font-bold tracking-tight text-gray-900 sm:text-4xl">
        Seven services, one app
      </h2>
      <p className="mt-3 max-w-2xl text-lg leading-relaxed text-gray-600">
        Order a meal, send a package, or have us buy something for you — without leaving the app.
      </p>

      <ul className="mt-10 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        {SERVICES.map((service) => (
          <li
            key={service.id}
            className="rounded-2xl border border-gray-200 bg-white p-4 transition-transform hover:-translate-y-0.5"
          >
            <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-gray-50 text-2xl">
              {service.emoji}
            </span>
            <p className="mt-3 font-semibold text-gray-900">{service.name}</p>
            <p className="mt-0.5 text-sm leading-snug text-gray-500">{service.tagline}</p>
          </li>
        ))}
      </ul>
    </div>
  </section>
);

export default ServicesSection;
