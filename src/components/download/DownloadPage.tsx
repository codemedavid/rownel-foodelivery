import React, { useEffect } from 'react';
import { APP_DOWNLOAD_LINKS } from '../../lib/appDownload';
import { usePlatform } from '../../hooks/usePlatform';
import DownloadHero from './DownloadHero';
import AppHighlights from './AppHighlights';
import ServicesSection from './ServicesSection';
import InstallSteps from './InstallSteps';
import DownloadFaq from './DownloadFaq';
import DownloadFooter from './DownloadFooter';

const PAGE_TITLE = 'Download the Row-Nel FooDelivery app';
const PAGE_DESCRIPTION =
  'Install the Row-Nel app for Android to order food, groceries, Pabili and errands in La Union — with live rider tracking and order alerts. iOS coming soon.';
const FALLBACK_PAGE_URL = 'https://row-nel.com/download';

function useDocumentMeta(title: string, description: string) {
  useEffect(() => {
    const previousTitle = document.title;
    document.title = title;

    const existing = document.querySelector<HTMLMetaElement>('meta[name="description"]');
    const tag = existing ?? document.createElement('meta');
    if (!existing) {
      tag.name = 'description';
      document.head.appendChild(tag);
    }
    const previousDescription = tag.content;
    tag.content = description;

    return () => {
      document.title = previousTitle;
      if (existing) tag.content = previousDescription;
      else tag.remove();
    };
  }, [title, description]);
}

/**
 * Public landing page for the mobile apps. Everything it links to lives in
 * src/lib/appDownload.ts, so shipping a new build is a one-line change.
 */
const DownloadPage: React.FC = () => {
  const { platform } = usePlatform();
  const { android, ios } = APP_DOWNLOAD_LINKS;

  useDocumentMeta(PAGE_TITLE, PAGE_DESCRIPTION);

  const pageUrl = typeof window === 'undefined' ? FALLBACK_PAGE_URL : window.location.href;

  return (
    <main className="min-h-screen bg-white">
      <DownloadHero platform={platform} androidRelease={android} iosRelease={ios} pageUrl={pageUrl} />
      <AppHighlights />
      <ServicesSection />
      <InstallSteps />
      <DownloadFaq />
      <DownloadFooter platform={platform} androidRelease={android} iosRelease={ios} />
    </main>
  );
};

export default DownloadPage;
