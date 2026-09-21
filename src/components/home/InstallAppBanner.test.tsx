import { describe, expect, it, beforeEach, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import InstallAppBanner, { INSTALL_BANNER_DISMISSED_KEY } from './InstallAppBanner';

const UA_ANDROID =
  'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126 Mobile Safari/537.36';
const UA_DESKTOP =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126 Safari/537.36';

const setUserAgent = (value: string) => {
  vi.spyOn(navigator, 'userAgent', 'get').mockReturnValue(value);
};

const renderBanner = () =>
  render(
    <MemoryRouter>
      <InstallAppBanner />
    </MemoryRouter>
  );

describe('InstallAppBanner', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
  });

  it('invites a phone browser to install the app', async () => {
    setUserAgent(UA_ANDROID);

    renderBanner();

    expect(await screen.findByRole('link', { name: /install the row-nel app/i })).toHaveAttribute('href', '/download');
  });

  it('stays out of the way on desktop, where the app cannot be installed', () => {
    setUserAgent(UA_DESKTOP);

    renderBanner();

    expect(screen.queryByRole('link', { name: /install the row-nel app/i })).not.toBeInTheDocument();
  });

  it('disappears when dismissed and remembers the dismissal', async () => {
    setUserAgent(UA_ANDROID);

    renderBanner();
    await userEvent.click(await screen.findByRole('button', { name: /dismiss/i }));

    expect(screen.queryByRole('link', { name: /install the row-nel app/i })).not.toBeInTheDocument();
    expect(localStorage.getItem(INSTALL_BANNER_DISMISSED_KEY)).toBe('1');
  });

  it('stays hidden on a later visit once it was dismissed', () => {
    setUserAgent(UA_ANDROID);
    localStorage.setItem(INSTALL_BANNER_DISMISSED_KEY, '1');

    renderBanner();

    expect(screen.queryByRole('link', { name: /install the row-nel app/i })).not.toBeInTheDocument();
  });
});
