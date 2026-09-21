/**
 * Everything the /download page needs to point people at a real build.
 *
 * The APK is served from a GitHub release on this repository, so the link is
 * the file itself and never expires — EAS internal-distribution artifacts are
 * deleted after 14 days, which used to silently break this page. Until a link
 * is configured the page renders a "build on the way" state, not a dead button.
 *
 * To publish a new Android build:
 *   1. eas build -p android --profile preview   (from mobile/)
 *   2. download the artifact, then
 *      gh release create android-v<version> <file>.apk
 *   3. point ANDROID_INSTALL_URL_OVERRIDE at the new asset and update
 *      ANDROID_EAS_BUILD_ID / APK_SIZE_LABEL to match.
 */

const EAS_ACCOUNT = 'itscodemedavid';
const EAS_PROJECT_SLUG = 'rownel-foodelivery';

/** Provenance only — the build the published APK came from. Not the link. */
export const ANDROID_EAS_BUILD_ID = 'a7c8a822-f296-4b4f-aed4-5051536088bb';

/**
 * The live download. A GitHub release asset is a direct .apk with no expiry
 * and no bandwidth metering; blank this to fall back to the Expo install page
 * built from the build id above.
 */
export const ANDROID_INSTALL_URL_OVERRIDE =
  'https://github.com/codemedavid/rownel-foodelivery/releases/download/android-v1.0.0/rownel-1.0.0.apk';

/** Set once the iOS app is live; until then the page says "coming soon". */
export const IOS_APP_STORE_URL = '';

export const APP_VERSION = '1.0.0';
export const APK_SIZE_LABEL = '~111 MB';
export const ANDROID_MIN_OS = 'Android 8.0';
export const IOS_MIN_OS = 'iOS 16';
export const SUPPORT_EMAIL = 'support@row-nel.com';

export type Platform = 'android' | 'ios' | 'desktop';

export interface AppRelease {
  readonly isAvailable: boolean;
  readonly url: string | null;
}

const PENDING_RELEASE: AppRelease = Object.freeze({ isAvailable: false, url: null });

const isUsableLink = (value: string): boolean => value.trim().startsWith('https://');

/** Builds the Expo install page for a finished EAS build. */
export const buildEasInstallUrl = (buildId: string): string | null => {
  const id = buildId.trim();
  if (!id) return null;
  return `https://expo.dev/accounts/${EAS_ACCOUNT}/projects/${EAS_PROJECT_SLUG}/builds/${id}`;
};

const toRelease = (link: string): AppRelease =>
  isUsableLink(link) ? Object.freeze({ isAvailable: true, url: link.trim() }) : PENDING_RELEASE;

export const resolveAndroidRelease = (link: string): AppRelease => toRelease(link);

export const resolveIosRelease = (link: string): AppRelease => toRelease(link);

const ANDROID_INSTALL_URL =
  ANDROID_INSTALL_URL_OVERRIDE || buildEasInstallUrl(ANDROID_EAS_BUILD_ID) || '';

export const APP_DOWNLOAD_LINKS = Object.freeze({
  android: resolveAndroidRelease(ANDROID_INSTALL_URL),
  ios: resolveIosRelease(IOS_APP_STORE_URL),
});

/**
 * iPadOS reports a Mac user agent when "Request Desktop Website" is on, so a
 * Mac-looking agent with touch points is really an iPad.
 */
export const detectPlatform = (userAgent: string, maxTouchPoints: number): Platform => {
  const ua = userAgent.toLowerCase();
  if (ua.includes('android')) return 'android';
  if (/iphone|ipad|ipod/.test(ua)) return 'ios';
  if (ua.includes('mac') && maxTouchPoints > 1) return 'ios';
  return 'desktop';
};

/** Reads the current platform from the browser; 'desktop' when there is no window. */
export const detectCurrentPlatform = (): Platform => {
  if (typeof navigator === 'undefined') return 'desktop';
  return detectPlatform(navigator.userAgent ?? '', navigator.maxTouchPoints ?? 0);
};
