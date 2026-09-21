import React from 'react';
import { Link } from 'react-router-dom';
import type { AppRelease, Platform } from '../../lib/appDownload';
import { SUPPORT_EMAIL } from '../../lib/appDownload';
import StoreButtons from './StoreButtons';

const DownloadFooter: React.FC<{
  platform: Platform;
  androidRelease: AppRelease;
  iosRelease: AppRelease;
}> = ({ platform, androidRelease, iosRelease }) => (
  <footer className="bg-[#04130a] text-white">
    <div className="mx-auto max-w-6xl px-5 pb-28 pt-16 sm:px-8 sm:pt-20 md:pb-20">
      <h2 className="max-w-2xl text-3xl font-bold tracking-tight sm:text-4xl">
        Hungry now? Get it on your phone.
      </h2>
      <p className="mt-3 max-w-xl leading-relaxed text-white/60">
        Same account, same saved addresses, same order history as the website.
      </p>

      <div className="mt-8">
        <StoreButtons androidRelease={androidRelease} iosRelease={iosRelease} isIosFirst={platform === 'ios'} />
      </div>

      <div className="mt-12 flex flex-wrap items-center gap-x-6 gap-y-3 border-t border-white/10 pt-6 text-sm text-white/50">
        <span>&copy; {new Date().getFullYear()} Row-Nel FooDelivery</span>
        <Link to="/privacy" className="transition-colors hover:text-white">
          Privacy Policy
        </Link>
        <a href={`mailto:${SUPPORT_EMAIL}`} className="transition-colors hover:text-white">
          {SUPPORT_EMAIL}
        </a>
      </div>
    </div>
  </footer>
);

export default DownloadFooter;
