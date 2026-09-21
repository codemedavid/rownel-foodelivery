import { BellRing, MapPinned, ShieldCheck, Wallet, type LucideIcon } from 'lucide-react';

export interface AppHighlight {
  readonly icon: LucideIcon;
  readonly title: string;
  readonly body: string;
}

/** The reasons to install rather than stay on the website. */
export const APP_HIGHLIGHTS: readonly AppHighlight[] = [
  {
    icon: BellRing,
    title: 'Know the moment it moves',
    body: 'Push alerts when the store accepts your order, when a rider picks it up, and when they are at your gate — even with the app closed.',
  },
  {
    icon: MapPinned,
    title: 'Watch your rider live',
    body: 'A real map with your rider moving on it, so you know whether to wait by the door or finish what you are doing.',
  },
  {
    icon: Wallet,
    title: 'Reorder in two taps',
    body: 'Your address, your number and your usual order stay saved. No retyping every time you are hungry.',
  },
  {
    icon: ShieldCheck,
    title: 'Built for La Union',
    body: 'Stores from Balaoan, Bangar, Naguilian and nearby towns — with the Pabili, Errands and Surprise services Row-Nel already runs.',
  },
];

export interface InstallStep {
  readonly title: string;
  readonly body: string;
}

/** Sideloading an APK is unfamiliar, so the steps are spelled out plainly. */
export const ANDROID_INSTALL_STEPS: readonly InstallStep[] = [
  {
    title: 'Tap Download APK',
    body: 'The Expo build page opens — tap Install there. Chrome then asks you to confirm, because the file does not come from the Play Store. Choose Download anyway.',
  },
  {
    title: 'Open the downloaded file',
    body: 'It is about 111 MB, so use Wi-Fi if you can. When it finishes, tap the notification — or find the .apk in your Files app under Downloads.',
  },
  {
    title: 'Allow this one install',
    body: 'Android asks permission the first time. Tap Settings → allow from this source, then press Back. You only do this once.',
  },
  {
    title: 'Tap Install, then Open',
    body: 'Installing takes a few seconds. Sign in with the same number you use on the website and your past orders are already there.',
  },
];

export interface FaqEntry {
  readonly question: string;
  readonly answer: string;
}

export const DOWNLOAD_FAQ: readonly FaqEntry[] = [
  {
    question: 'Is the APK safe to install?',
    answer:
      'Yes. It is built and signed by Row-Nel on Expo Application Services and downloaded straight from Expo — the same pipeline that will publish the Play Store and App Store versions. Only install it from this page or from a link Row-Nel sent you.',
  },
  {
    question: 'Why is it not on the Play Store yet?',
    answer:
      'The store listing is still being prepared, and we would rather have you ordering now than waiting on a review queue. The APK is the same app — when the listing goes live you can switch to it without losing your account.',
  },
  {
    question: 'When is the iPhone version coming?',
    answer:
      'We are working on it. Until it lands, row-nel.com works fully on Safari — add it to your Home Screen and it behaves almost like the app.',
  },
  {
    question: 'How do I update the app later?',
    answer:
      'Come back to this page and install the newest build over the old one. Your account, addresses and order history are stored on our servers, so nothing is lost.',
  },
  {
    question: 'Does it work on a slow connection?',
    answer:
      'The app loads menus and images far more efficiently than the website, so it holds up better on weak mobile data. Ordering still needs a connection.',
  },
];
