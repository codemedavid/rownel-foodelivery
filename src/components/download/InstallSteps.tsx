import React from 'react';
import { ShieldCheck } from 'lucide-react';
import { ANDROID_INSTALL_STEPS } from './downloadContent';

/**
 * Sideloading instructions. Shown to everyone — people often read the steps on
 * a laptop before installing on their phone.
 */
const InstallSteps: React.FC = () => (
  <section className="mx-auto max-w-6xl px-5 py-16 sm:px-8 sm:py-20" aria-labelledby="install-heading">
    <div className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)] lg:gap-16">
      <div>
        <h2 id="install-heading" className="text-3xl font-bold tracking-tight text-gray-900 sm:text-4xl">
          Installing takes a minute
        </h2>
        <p className="mt-3 text-lg leading-relaxed text-gray-600">
          Android installs apps from outside the Play Store once you say it is fine. Here is exactly what you will
          see.
        </p>

        <div className="mt-6 flex gap-3 rounded-2xl border border-brand-100 bg-brand-50/60 p-4">
          <ShieldCheck className="h-5 w-5 flex-shrink-0 text-brand-700" />
          <p className="text-sm leading-relaxed text-brand-900">
            The file is signed by Row-Nel and served by Expo, the build service behind the app. Only install builds
            linked from this page.
          </p>
        </div>
      </div>

      <ol className="space-y-4">
        {ANDROID_INSTALL_STEPS.map((step, index) => (
          <li key={step.title} className="flex gap-4 rounded-2xl border border-gray-200 bg-white p-5">
            <span className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-gray-900 text-sm font-bold text-white">
              {index + 1}
            </span>
            <span>
              <span className="block font-semibold text-gray-900">{step.title}</span>
              <span className="mt-1 block leading-relaxed text-gray-600">{step.body}</span>
            </span>
          </li>
        ))}
      </ol>
    </div>
  </section>
);

export default InstallSteps;
