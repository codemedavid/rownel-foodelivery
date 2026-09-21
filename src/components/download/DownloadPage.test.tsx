import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { SERVICES } from '../../lib/services';
import { ANDROID_INSTALL_STEPS } from './downloadContent';
import type { AppRelease } from '../../lib/appDownload';

const ANDROID_URL = 'https://expo.dev/accounts/itscodemedavid/projects/rownel-foodelivery/builds/abc';

type MockLinks = { android: AppRelease; ios: AppRelease };

const PENDING_LINKS: MockLinks = {
  android: { isAvailable: false, url: null },
  ios: { isAvailable: false, url: null },
};

const mockLinks = vi.hoisted(() => ({ value: {} as { android: unknown; ios: unknown } }));

vi.mock('../../lib/appDownload', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../lib/appDownload')>();
  return {
    ...actual,
    get APP_DOWNLOAD_LINKS() {
      return mockLinks.value;
    },
  };
});

const { default: DownloadPage } = await import('./DownloadPage');

const renderPage = () =>
  render(
    <MemoryRouter>
      <DownloadPage />
    </MemoryRouter>
  );

describe('DownloadPage', () => {
  beforeEach(() => {
    mockLinks.value = PENDING_LINKS;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('links the Android badge to the configured build', async () => {
    mockLinks.value = { ...PENDING_LINKS, android: { isAvailable: true, url: ANDROID_URL } };

    renderPage();

    const [badge] = await screen.findAllByRole('link', { name: /android apk/i });
    expect(badge).toHaveAttribute('href', ANDROID_URL);
    expect(badge).toHaveAttribute('rel', expect.stringContaining('noopener'));
  });

  it('shows a build-on-the-way state instead of a dead button when no link is configured', () => {
    renderPage();

    expect(screen.queryByRole('link', { name: /android apk/i })).not.toBeInTheDocument();
    expect(screen.getAllByText(/build on the way/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/email us/i).length).toBeGreaterThan(0);
  });

  it('says the App Store version is coming until a store URL exists', () => {
    renderPage();

    expect(screen.queryByRole('link', { name: /app store/i })).not.toBeInTheDocument();
    expect(screen.getAllByText(/coming soon to the/i).length).toBeGreaterThan(0);
  });

  it('always offers the web app as a way to order now', () => {
    renderPage();

    const [webLink] = screen.getAllByRole('link', { name: /order right now/i });
    expect(webLink).toHaveAttribute('href', '/');
  });

  it('lists every Row-Nel service, straight from the app definitions', () => {
    renderPage();

    const services = screen.getByRole('region', { name: /seven services/i });

    expect(within(services).getAllByRole('listitem')).toHaveLength(SERVICES.length);
    expect(within(services).getByText('Pabili')).toBeInTheDocument();
  });

  it('spells out the sideload steps, since the APK is not from the Play Store', () => {
    renderPage();

    const install = screen.getByRole('region', { name: /installing takes a minute/i });

    expect(within(install).getAllByRole('listitem')).toHaveLength(ANDROID_INSTALL_STEPS.length);
    expect(within(install).getByText(/allow this one install/i)).toBeInTheDocument();
  });

  it('sets a descriptive document title and restores it on unmount', () => {
    document.title = 'Row-Nel';

    const { unmount } = renderPage();
    expect(document.title).toMatch(/download the row-nel/i);

    unmount();
    expect(document.title).toBe('Row-Nel');
  });
});
