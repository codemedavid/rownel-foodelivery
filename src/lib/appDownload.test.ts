import { describe, expect, it } from 'vitest';
import {
  APP_DOWNLOAD_LINKS,
  buildEasInstallUrl,
  detectPlatform,
  resolveAndroidRelease,
  resolveIosRelease,
} from './appDownload';

const UA_ANDROID =
  'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126 Mobile Safari/537.36';
const UA_IPHONE =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1';
const UA_IPAD_DESKTOP_MODE =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15';
const UA_MAC =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126 Safari/537.36';
const UA_WINDOWS =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126 Safari/537.36';

describe('detectPlatform', () => {
  it('detects Android phones', () => {
    expect(detectPlatform(UA_ANDROID, 0)).toBe('android');
  });

  it('detects iPhones', () => {
    expect(detectPlatform(UA_IPHONE, 0)).toBe('ios');
  });

  it('detects an iPad requesting the desktop site via its touch points', () => {
    expect(detectPlatform(UA_IPAD_DESKTOP_MODE, 5)).toBe('ios');
  });

  it('treats a touchless Mac as desktop', () => {
    expect(detectPlatform(UA_MAC, 0)).toBe('desktop');
  });

  it('treats Windows as desktop', () => {
    expect(detectPlatform(UA_WINDOWS, 0)).toBe('desktop');
  });

  it('falls back to desktop for an empty user agent', () => {
    expect(detectPlatform('', 0)).toBe('desktop');
  });
});

describe('buildEasInstallUrl', () => {
  it('builds the Expo install page URL for a build id', () => {
    expect(buildEasInstallUrl('3cbfee2d-39bc-4b20-ad77-aefe0f3d6831')).toBe(
      'https://expo.dev/accounts/itscodemedavid/projects/rownel-foodelivery/builds/3cbfee2d-39bc-4b20-ad77-aefe0f3d6831'
    );
  });

  it('returns null when no build id is configured', () => {
    expect(buildEasInstallUrl('')).toBeNull();
    expect(buildEasInstallUrl('   ')).toBeNull();
  });
});

describe('resolveAndroidRelease', () => {
  it('is available when a link is configured', () => {
    const release = resolveAndroidRelease('https://expo.dev/accounts/a/projects/b/builds/c');

    expect(release.isAvailable).toBe(true);
    expect(release.url).toBe('https://expo.dev/accounts/a/projects/b/builds/c');
  });

  it('is pending, with no url, when the link is blank', () => {
    const release = resolveAndroidRelease('');

    expect(release.isAvailable).toBe(false);
    expect(release.url).toBeNull();
  });

  it('ignores a whitespace-only link', () => {
    expect(resolveAndroidRelease('   ').isAvailable).toBe(false);
  });

  it('rejects a non-https link so the button never points at plain http', () => {
    expect(resolveAndroidRelease('http://expo.dev/builds/c').isAvailable).toBe(false);
  });
});

describe('resolveIosRelease', () => {
  it('is pending until an App Store URL is configured', () => {
    expect(resolveIosRelease('').isAvailable).toBe(false);
  });

  it('is available once the App Store URL is set', () => {
    const release = resolveIosRelease('https://apps.apple.com/app/id123456789');

    expect(release.isAvailable).toBe(true);
    expect(release.url).toBe('https://apps.apple.com/app/id123456789');
  });
});

describe('APP_DOWNLOAD_LINKS', () => {
  it('exposes the configured links as a frozen record', () => {
    expect(Object.isFrozen(APP_DOWNLOAD_LINKS)).toBe(true);
  });
});
