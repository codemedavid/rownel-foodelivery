import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { Download, X } from 'lucide-react';
import { usePlatform } from '../../hooks/usePlatform';

export const INSTALL_BANNER_DISMISSED_KEY = 'rownel:install-banner-dismissed';

const readDismissed = (): boolean => {
  try {
    return localStorage.getItem(INSTALL_BANNER_DISMISSED_KEY) === '1';
  } catch {
    return false;
  }
};

const rememberDismissed = (): void => {
  try {
    localStorage.setItem(INSTALL_BANNER_DISMISSED_KEY, '1');
  } catch {
    // storage disabled — the banner simply comes back next visit
  }
};

/**
 * Invites phone visitors to install the native app. Hidden on desktop, where
 * there is nothing to install, and gone for good once dismissed.
 */
const InstallAppBanner: React.FC = () => {
  const { platform, isResolved } = usePlatform();
  const [isDismissed, setIsDismissed] = useState(readDismissed);

  const handleDismiss = () => {
    setIsDismissed(true);
    rememberDismissed();
  };

  if (!isResolved || platform === 'desktop' || isDismissed) return null;

  return (
    <section className="flex items-center gap-3 rounded-2xl border border-gray-200 bg-white p-3 shadow-sm">
      <img src="/app-icon.png" alt="" width={40} height={40} className="h-10 w-10 flex-shrink-0 rounded-xl object-cover" />

      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-bold text-gray-900">Get the Row-Nel app</p>
        <p className="mt-0.5 truncate text-xs text-gray-500">Live tracking &amp; order alerts</p>
      </div>

      <Link
        to="/download"
        aria-label="Install the Row-Nel app"
        className="flex flex-shrink-0 items-center gap-1.5 rounded-full bg-brand-600 px-3.5 py-2 text-xs font-bold text-white transition-colors hover:bg-brand-700"
      >
        <Download className="h-3.5 w-3.5" aria-hidden="true" />
        Install
      </Link>

      <button
        type="button"
        onClick={handleDismiss}
        aria-label="Dismiss the install banner"
        className="-mr-1 flex-shrink-0 rounded-full p-1.5 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600"
      >
        <X className="h-4 w-4" />
      </button>
    </section>
  );
};

export default InstallAppBanner;
