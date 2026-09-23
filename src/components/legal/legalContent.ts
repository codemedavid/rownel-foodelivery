// Content for the public legal pages, kept apart from presentation so the
// wording can be reviewed (and, when a lawyer asks, diffed) without reading
// JSX. Every item here describes something the apps genuinely do — see the
// collection points cited in each entry.

export const PRIVACY_LAST_UPDATED = '21 September 2026';

/** Where a customer can reach a human about their data. */
export const PRIVACY_CONTACT_EMAIL = 'support@row-nel.com';

export interface LegalSection {
  heading: string;
  /** Rendered as paragraphs, in order. */
  paragraphs?: string[];
  /** Rendered as a bulleted list under the paragraphs. */
  bullets?: string[];
}

export const PRIVACY_SECTIONS: readonly LegalSection[] = [
  {
    heading: 'Who we are',
    paragraphs: [
      'Row-Nel Food Delivery ("Row-Nel", "we", "us") operates a food ordering and delivery service in the Philippines through our website at row-nel.com and our mobile app.',
      'This policy explains what personal information we collect, why we collect it, who we share it with, and the choices you have. It applies to customers, delivery riders, and staff who use our apps.',
    ],
  },
  {
    heading: 'Information you give us',
    bullets: [
      'Account details — your name, email address, and phone number when you create an account or place an order.',
      'Delivery addresses — the addresses you enter or select at checkout, including any landmarks or delivery notes you add.',
      'Order information — the items you order, your order history, and the merchant you ordered from.',
      'Payment method selection — which payment option you chose. We do not collect or store full card numbers.',
      'Rider and staff details — for riders and staff, the additional onboarding information needed to operate the service, such as contact details and assignment records.',
    ],
  },
  {
    heading: 'Information collected automatically',
    bullets: [
      'Location — with your permission, the mobile app reads your device location while the app is open, to suggest your delivery address and to show riders the route to a delivery. We do not track your location in the background.',
      'Push notification token — if you allow notifications, we store the token your device issues so we can send you order updates.',
      'Device information — basic details about the device and app version, used to deliver notifications correctly and diagnose faults.',
      'Usage and diagnostic data — technical logs generated when the app talks to our servers.',
    ],
  },
  {
    heading: 'How we use your information',
    bullets: [
      'To take, prepare, and deliver your orders, and to show you their status.',
      'To let you and your assigned rider coordinate a delivery.',
      'To send order updates, and other service messages you have agreed to receive.',
      'To provide customer support and resolve problems with an order.',
      'To keep the service secure, prevent fraud and abuse, and meet our legal and tax obligations.',
      'To understand, in aggregate, how the service is used so we can improve it.',
    ],
  },
  {
    heading: 'Who we share it with',
    paragraphs: [
      'We do not sell your personal information. We share it only with the service providers we need to operate Row-Nel, and only as far as each needs:',
    ],
    bullets: [
      'Merchants and delivery riders — the details needed to prepare and deliver your order, including your delivery address and contact number.',
      'Supabase — our database, authentication, and file storage provider.',
      'Apple — address search and map features use the Apple Maps Server API and MapKit JS. Address searches are sent through our own servers.',
      'Expo — delivery of push notifications to your device.',
      'ImageKit and Cloudflare — hosting and delivery of images used in the apps.',
      'Vercel — hosting of our website and server functions.',
      'Authorities — where we are legally required to disclose information, or to protect the rights and safety of our users, riders, or staff.',
    ],
  },
  {
    heading: 'How long we keep it',
    paragraphs: [
      'We keep your account and order information for as long as your account is active, and afterwards only as long as we need it for the purposes described above — principally to resolve disputes, and to meet accounting, tax, and other legal obligations.',
      'Diagnostic logs are kept for a short period and then deleted.',
    ],
  },
  {
    heading: 'Your choices and rights',
    paragraphs: [
      'You can review and update your account details at any time from your profile. You can turn off location access and notifications in your device settings; the app will continue to work, though you will need to type your address and you will not receive order updates.',
      'You may ask us to give you a copy of your personal information, correct it, or delete it. You can delete your account and its associated personal information from within the app, or by contacting us at the address below. Some records may be retained where the law requires it.',
      'The Philippine Data Privacy Act of 2012 gives data subjects rights of access, correction, objection, erasure, and the right to complain to the National Privacy Commission.',
    ],
  },
  {
    heading: 'Security',
    paragraphs: [
      'Traffic between the apps and our servers is encrypted in transit. Access to personal information is restricted to the people who need it to operate the service. No service can promise perfect security, but we take reasonable steps to protect your information and will notify you and the relevant authority if a breach affecting you occurs.',
    ],
  },
  {
    heading: "Children's privacy",
    paragraphs: [
      'Row-Nel is not directed at children under 13, and we do not knowingly collect their personal information. If you believe a child has given us their information, contact us and we will delete it.',
    ],
  },
  {
    heading: 'Changes to this policy',
    paragraphs: [
      'If we change this policy we will update the date at the top of this page, and where the change is significant we will tell you in the app. Continuing to use Row-Nel after a change means you accept the updated policy.',
    ],
  },
] as const;

// What delete_my_account() actually does — see
// supabase/migrations/20260921000000_add_account_deletion.sql. Google Play
// links this page from the store listing, so it must name the steps and say
// what is deleted and what is kept.
export const ACCOUNT_DELETION_SECTIONS: readonly LegalSection[] = [
  {
    heading: 'Delete your account in the app',
    bullets: [
      'Open the Row-Nel Food Delivery app and sign in.',
      'Go to the Profile tab.',
      'Tap "Delete account", then confirm twice.',
    ],
  },
  {
    heading: 'Delete your account on the website',
    bullets: [
      'Go to row-nel.com/profile and sign in.',
      'Select "Delete Account", then confirm.',
    ],
  },
  {
    heading: 'Can\'t sign in?',
    paragraphs: [
      'Email us from the address on your account and ask us to delete it. We will confirm by email once it is done.',
    ],
  },
  {
    heading: 'What is deleted',
    bullets: [
      'Your sign-in details: email address and password.',
      'Your profile: name and phone number.',
      'Your notification settings and the push notification tokens for your devices.',
      'The name, phone number, delivery address and notes on your past orders.',
    ],
    paragraphs: [
      'Deletion happens immediately and cannot be undone. Saved delivery addresses are stored only on your phone, not on our servers; uninstalling the app or clearing its data removes them.',
    ],
  },
  {
    heading: 'What is kept',
    paragraphs: [
      'The orders themselves — items, prices, payment method and dates — are kept as accounting records, with your personal details removed as above, so they can no longer be linked to you. Delivery rider accounts are closed by contacting us, because rider earnings records must be kept.',
    ],
  },
];
