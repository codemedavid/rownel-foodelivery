import React from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, Sparkles } from 'lucide-react';
import type { AppRelease, Platform } from '../../lib/appDownload';
import StoreButtons from './StoreButtons';
import PhoneMockup from './PhoneMockup';
import QrPanel from './QrPanel';

interface DownloadHeroProps {
  platform: Platform;
  androidRelease: AppRelease;
  iosRelease: AppRelease;
  /** Encoded in the QR code so a desktop reader can hop to their phone. */
  pageUrl: string;
}

const DownloadHero: React.FC<DownloadHeroProps> = ({ platform, androidRelease, iosRelease, pageUrl }) => (
  <header className="relative overflow-hidden bg-[#04130a] text-white">
    {/* Brand glow, kept behind the content and out of the accessibility tree. */}
    <div
      aria-hidden="true"
      className="pointer-events-none absolute inset-0 bg-[radial-gradient(70%_55%_at_15%_0%,rgba(0,177,79,0.35),transparent_70%),radial-gradient(45%_45%_at_95%_15%,rgba(253,224,71,0.12),transparent_70%)]"
    />

    <div className="relative mx-auto max-w-6xl px-5 pb-14 pt-6 sm:px-8 sm:pb-20 sm:pt-8">
      <Link
        to="/"
        className="inline-flex items-center gap-1.5 text-sm font-medium text-white/70 transition-colors hover:text-white"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to Row-Nel
      </Link>

      <div className="mt-10 grid items-center gap-12 lg:grid-cols-[minmax(0,1fr)_auto] lg:gap-16">
        <div>
          <span className="inline-flex items-center gap-2 rounded-full border border-brand-400/30 bg-brand-500/10 px-3 py-1 text-xs font-semibold text-brand-300">
            <Sparkles className="h-3.5 w-3.5" />
            Now in early release
          </span>

          <div className="mt-6 flex items-center gap-4">
            <img
              src="/app-icon.png"
              alt=""
              width={64}
              height={64}
              className="h-16 w-16 rounded-2xl object-cover shadow-lg ring-1 ring-white/20"
            />
            <div>
              <p className="text-sm font-medium text-white/60">Row-Nel FooDelivery</p>
              <p className="text-sm text-white/40">Food · Groceries · Pabili · Errands</p>
            </div>
          </div>

          <h1 className="mt-6 text-[2rem] font-bold leading-[1.1] tracking-tight sm:text-5xl sm:leading-[1.08] lg:text-[3.4rem]">
            Your town&rsquo;s kitchen,
            <span className="block text-brand-400">one tap away.</span>
          </h1>

          <p className="mt-5 max-w-xl text-lg leading-relaxed text-white/70">
            The Row-Nel app puts every store we deliver from in your pocket — with live rider tracking, order
            alerts that actually arrive, and your usual order ready to repeat.
          </p>

          <div className="mt-8">
            <StoreButtons
              androidRelease={androidRelease}
              iosRelease={iosRelease}
              isIosFirst={platform === 'ios'}
            />
          </div>

          {platform === 'desktop' && (
            <div className="mt-8 max-w-md">
              <QrPanel url={pageUrl} />
            </div>
          )}
        </div>

        <div className="lg:pl-4">
          <PhoneMockup />
        </div>
      </div>
    </div>
  </header>
);

export default DownloadHero;
