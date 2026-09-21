// Fills the App Store Connect listing for Rownel Food Delivery from the copy
// in docs/appstore/listing.md. Idempotent: re-running just re-applies values.
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const APP_ID = process.env.ASC_APP_ID;
const LOCALE = 'en-US';

const keyPath = process.env.EXPO_ASC_API_KEY_PATH ?? path.join(ROOT, 'credentials/AuthKey_ASC.p8');
const keyId = process.env.ASC_KEY_ID;
const issuer = process.env.ASC_ISSUER_ID;
if (!APP_ID || !keyId || !issuer) {
  console.error('ASC_APP_ID, ASC_KEY_ID and ASC_ISSUER_ID are required');
  process.exit(1);
}

const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
const now = Math.floor(Date.now() / 1000);
const signing =
  `${b64({ alg: 'ES256', kid: keyId, typ: 'JWT' })}.` +
  b64({ iss: issuer, iat: now, exp: now + 1200, aud: 'appstoreconnect-v1' });
const JWT =
  `${signing}.` +
  crypto
    .sign('sha256', Buffer.from(signing), {
      key: fs.readFileSync(keyPath, 'utf8'),
      dsaEncoding: 'ieee-p1363',
    })
    .toString('base64url');

const api = async (p, method = 'GET', body) => {
  const res = await fetch(`https://api.appstoreconnect.apple.com${p}`, {
    method,
    headers: { Authorization: `Bearer ${JWT}`, 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json = null;
  try { json = JSON.parse(text); } catch { /* empty body on 204 */ }
  return { status: res.status, json, text };
};

const ok = (r) => r.status >= 200 && r.status < 300;
const detail = (r) => r.json?.errors?.map((e) => `${e.title}: ${e.detail}`).join('; ') ?? r.text.slice(0, 300);
const step = (label, r) => console.log(`${ok(r) ? 'OK  ' : 'FAIL'}  ${label}${ok(r) ? '' : ' -> ' + detail(r)}`);

const SUBTITLE = 'Delivery, pabili at pasabay';
const PROMO =
  'Order food, groceries and pabili from your favourite local stores - and watch your rider come to you in real time.';
const KEYWORDS = 'delivery,food,pabili,pasabay,errand,grocery,vigan,ilocos,rider,padala,takeout,local';
const DESCRIPTION = `Row-Nel brings your neighbourhood to your door.

Order from local restaurants and stores, send someone on an errand, or have something picked up and dropped off - all from one app, with live tracking from the moment you order until your rider knocks.

WHAT YOU CAN BOOK
Food - order from restaurants and eateries near you
Grocery - fresh goods and sari-sari staples
Pabili - tell us what to buy and we'll buy it for you
Pasabay - send an item along an existing route
Pick-up - collect something and bring it to you
Errands - queue, pay bills, drop off documents
Surprise - send a gift without leaving home

BUILT AROUND YOUR LOCATION
Set your delivery pin once and the app only shows you stores that actually deliver to you. Search works across dishes, stores and cuisines, so you can look for "sisig" instead of guessing which store has it.

KNOW WHERE YOUR ORDER IS
Follow every order from confirmed to preparing to on the way. When a rider picks up your order you get their details and a live map - plus a push notification at each step, so you don't have to keep the app open.

REORDER IN SECONDS
Your order history keeps every past basket. Tap one to rebuild the whole cart and check out again.

Row-Nel is operated locally. Questions, special requests or something that doesn't fit a category - message the team and we'll sort it out.`;
const WHATS_NEW =
  'First release of the Row-Nel app. Order food, groceries, pabili and errands from local stores, and track your rider live from checkout to your door.';

for (const [label, value, limit] of [
  ['subtitle', SUBTITLE, 30],
  ['promotional text', PROMO, 170],
  ['keywords', KEYWORDS, 100],
  ['description', DESCRIPTION, 4000],
]) {
  if (value.length > limit) {
    console.error(`${label} is ${value.length} chars, limit ${limit}`);
    process.exit(1);
  }
}

// ---- App info: categories, name, subtitle, privacy policy -------------------
const infos = await api(`/v1/apps/${APP_ID}/appInfos`);
const info = infos.json.data.find((i) => i.attributes.appStoreState !== 'READY_FOR_SALE') ?? infos.json.data[0];
console.log(`appInfo ${info.id} (state ${info.attributes.appStoreState})`);

step(
  'categories: Food & Drink / Shopping',
  await api(`/v1/appInfos/${info.id}`, 'PATCH', {
    data: {
      type: 'appInfos',
      id: info.id,
      relationships: {
        primaryCategory: { data: { type: 'appCategories', id: 'FOOD_AND_DRINK' } },
        secondaryCategory: { data: { type: 'appCategories', id: 'SHOPPING' } },
      },
    },
  })
);

const infoLocs = await api(`/v1/appInfos/${info.id}/appInfoLocalizations`);
const infoLoc = infoLocs.json.data.find((l) => l.attributes.locale === LOCALE);
step(
  'name / subtitle / privacy policy url',
  await api(`/v1/appInfoLocalizations/${infoLoc.id}`, 'PATCH', {
    data: {
      type: 'appInfoLocalizations',
      id: infoLoc.id,
      attributes: {
        name: 'Rownel Food Delivery',
        subtitle: SUBTITLE,
        privacyPolicyUrl: 'https://www.row-nel.com/privacy',
      },
    },
  })
);

// ---- Version: description, keywords, urls, what's new -----------------------
// App Store Connect seeds a "1.0" version record on app creation, but the
// binary is CFBundleShortVersionString 1.0.0 -- they must match, and Apple
// refuses to create a second version while one is in PREPARE_FOR_SUBMISSION.
// So reuse the editable record and rename it rather than creating one.
const versions = await api(`/v1/apps/${APP_ID}/appStoreVersions?limit=20`);
let version = versions.json.data?.find((v) =>
  ['PREPARE_FOR_SUBMISSION', 'DEVELOPER_REJECTED', 'REJECTED'].includes(v.attributes.appStoreState)
);
if (!version) {
  console.error('no editable version record found');
  process.exit(1);
}
if (version.attributes.versionString !== '1.0.0') {
  step(
    `version string ${version.attributes.versionString} -> 1.0.0`,
    await api(`/v1/appStoreVersions/${version.id}`, 'PATCH', {
      data: { type: 'appStoreVersions', id: version.id, attributes: { versionString: '1.0.0' } },
    })
  );
}
console.log(`appStoreVersion ${version.id} (1.0.0, ${version.attributes.appStoreState})`);

const verLocs = await api(`/v1/appStoreVersions/${version.id}/appStoreVersionLocalizations`);
const verLoc = verLocs.json.data.find((l) => l.attributes.locale === LOCALE);
step(
  'description / keywords / support url / promo / what’s new',
  await api(`/v1/appStoreVersionLocalizations/${verLoc.id}`, 'PATCH', {
    data: {
      type: 'appStoreVersionLocalizations',
      id: verLoc.id,
      attributes: {
        description: DESCRIPTION,
        keywords: KEYWORDS,
        supportUrl: 'https://www.row-nel.com',
        marketingUrl: 'https://www.row-nel.com',
        promotionalText: PROMO,
        // whatsNew is rejected on a first release ("cannot be edited at this
        // time") -- there is no previous version to describe changes against.
        // Set it from the next update onwards.
      },
    },
  })
);
