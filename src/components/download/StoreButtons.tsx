import React from 'react';
import { Link } from 'react-router-dom';
import { Apple, Download, Globe, Smartphone } from 'lucide-react';
import type { AppRelease } from '../../lib/appDownload';
import { APK_SIZE_LABEL, ANDROID_MIN_OS, APP_VERSION, SUPPORT_EMAIL } from '../../lib/appDownload';

const BADGE_BASE =
  'group flex w-full items-center gap-3 rounded-2xl px-5 py-3.5 text-left transition-all focus:outline-none focus-visible:ring-4 focus-visible:ring-brand-400/50 sm:w-auto sm:min-w-[236px]';

const NOTIFY_SUBJECT = encodeURIComponent('Tell me when the Row-Nel app is ready');

function BadgeLabel({ kicker, title }: { kicker: string; title: string }) {
  return (
    <span className="min-w-0">
      <span className="block text-[11px] font-medium uppercase tracking-wider opacity-70">{kicker}</span>
      <span className="block truncate text-base font-bold leading-tight">{title}</span>
    </span>
  );
}

function AndroidBadge({ release }: { release: AppRelease }) {
  if (release.isAvailable && release.url) {
    return (
      <a
        href={release.url}
        target="_blank"
        rel="noopener noreferrer"
        className={`${BADGE_BASE} bg-brand-500 text-white shadow-lg shadow-brand-500/30 hover:bg-brand-400 hover:shadow-xl hover:shadow-brand-500/40 active:scale-[0.98]`}
      >
        <Download className="h-6 w-6 flex-shrink-0 transition-transform group-hover:translate-y-0.5" />
        <BadgeLabel kicker="Free download" title="Android APK" />
      </a>
    );
  }

  return (
    <div
      className={`${BADGE_BASE} cursor-default border border-white/15 bg-white/5 text-white/70`}
      role="status"
    >
      <Smartphone className="h-6 w-6 flex-shrink-0" />
      <BadgeLabel kicker="Android" title="Build on the way" />
    </div>
  );
}

function IosBadge({ release }: { release: AppRelease }) {
  if (release.isAvailable && release.url) {
    return (
      <a
        href={release.url}
        target="_blank"
        rel="noopener noreferrer"
        className={`${BADGE_BASE} bg-white text-gray-900 shadow-lg shadow-black/20 hover:bg-gray-100 active:scale-[0.98]`}
      >
        <Apple className="h-6 w-6 flex-shrink-0" />
        <BadgeLabel kicker="Download on the" title="App Store" />
      </a>
    );
  }

  return (
    <div className={`${BADGE_BASE} cursor-default border border-white/15 bg-white/5 text-white/70`} role="status">
      <Apple className="h-6 w-6 flex-shrink-0" />
      <BadgeLabel kicker="Coming soon to the" title="App Store" />
    </div>
  );
}

/**
 * Store badges plus the always-available web fallback. Both badges are always
 * shown — people share this link with friends on the other platform — and the
 * caller orders them so the visitor's own platform comes first.
 */
const StoreButtons: React.FC<{
  androidRelease: AppRelease;
  iosRelease: AppRelease;
  isIosFirst: boolean;
}> = ({ androidRelease, iosRelease, isIosFirst }) => {
  const badges = isIosFirst
    ? [<IosBadge key="ios" release={iosRelease} />, <AndroidBadge key="android" release={androidRelease} />]
    : [<AndroidBadge key="android" release={androidRelease} />, <IosBadge key="ios" release={iosRelease} />];

  return (
    <div>
      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap">{badges}</div>

      <p className="mt-4 text-sm text-white/60">
        {androidRelease.isAvailable ? (
          <>
            Version {APP_VERSION} · {APK_SIZE_LABEL} · {ANDROID_MIN_OS} or newer
          </>
        ) : (
          <>
            We are putting the finishing touches on the first public build.{' '}
            <a
              href={`mailto:${SUPPORT_EMAIL}?subject=${NOTIFY_SUBJECT}`}
              className="font-semibold text-brand-300 underline underline-offset-2 hover:text-brand-200"
            >
              Email us
            </a>{' '}
            and we will send you the link the day it is ready.
          </>
        )}
      </p>

      <Link
        to="/"
        className="mt-4 inline-flex items-center gap-2 text-sm font-semibold text-white/80 underline-offset-4 transition-colors hover:text-white hover:underline"
      >
        <Globe className="h-4 w-4" />
        Or order right now at row-nel.com
      </Link>
    </div>
  );
};

export default StoreButtons;
