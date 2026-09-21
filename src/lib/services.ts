import type { Merchant } from '../types';

/**
 * The services Row-Nel offers. They form the top level of the customer app:
 * Home → service → (category) → merchant → item → checkout.
 *
 * In-app services drive filtering and checkout defaults. Contact services
 * are requests fulfilled by the Row-Nel team over chat until they get their
 * own flow.
 */
export type ServiceId = 'food' | 'pasabay' | 'pickup' | 'grocery' | 'pabili' | 'errands' | 'surprise';

export type ServiceKind = 'in-app' | 'contact';

export interface ServiceDefinition {
  id: ServiceId;
  name: string;
  tagline: string;
  emoji: string;
  kind: ServiceKind;
  /** Checkout defaults applied when the shopper enters through this service. */
  fulfilment?: { serviceType: 'delivery' | 'pickup'; deliveryMode?: 'priority' | 'economy' };
  /** Which merchants belong to this service. Omitted = every merchant. */
  matches?: (merchant: Merchant) => boolean;
  /** Message pre-filled when contacting Row-Nel about a contact service. */
  requestTemplate?: string;
}

const GROCERY_CATEGORIES = new Set(['grocery', 'supermarket', 'convenience', 'pharmacy', 'market']);

export const isGroceryMerchant = (merchant: Merchant): boolean =>
  GROCERY_CATEGORIES.has(merchant.category.toLowerCase());

export const supportsPasabay = (merchant: Merchant): boolean => (merchant.fixedDeliveryFee ?? 0) > 0;

export const SERVICES: readonly ServiceDefinition[] = [
  {
    id: 'food',
    name: 'Food',
    tagline: 'Rush delivery, 30–45 min',
    emoji: '🍔',
    kind: 'in-app',
    fulfilment: { serviceType: 'delivery', deliveryMode: 'priority' },
    matches: (merchant) => !isGroceryMerchant(merchant),
  },
  {
    id: 'pasabay',
    name: 'Pasabay',
    tagline: 'Budget delivery, fixed fee',
    emoji: '🛵',
    kind: 'in-app',
    fulfilment: { serviceType: 'delivery', deliveryMode: 'economy' },
    matches: supportsPasabay,
  },
  {
    id: 'pickup',
    name: 'Pick-up',
    tagline: 'Order ahead, no delivery fee',
    emoji: '🥡',
    kind: 'in-app',
    fulfilment: { serviceType: 'pickup' },
  },
  {
    id: 'grocery',
    name: 'Grocery',
    tagline: 'Essentials to your door',
    emoji: '🛒',
    kind: 'in-app',
    fulfilment: { serviceType: 'delivery', deliveryMode: 'priority' },
    matches: isGroceryMerchant,
  },
  {
    id: 'pabili',
    name: 'Pabili',
    tagline: 'We buy it for you',
    emoji: '🛍️',
    kind: 'contact',
    requestTemplate: 'Hi Row-Nel! I would like a Pabili request. Item(s): … Store: … Deliver to: …',
  },
  {
    id: 'errands',
    name: 'Errands',
    tagline: 'Padala, bills, pick-up & drop',
    emoji: '📦',
    kind: 'contact',
    requestTemplate: 'Hi Row-Nel! I need an errand done. Task: … Pick-up: … Drop-off: …',
  },
  {
    id: 'surprise',
    name: 'Surprise',
    tagline: 'Gifts & surprise deliveries',
    emoji: '🎁',
    kind: 'contact',
    requestTemplate: 'Hi Row-Nel! I want to send a surprise delivery. Gift: … Recipient: … Address: … Date/time: …',
  },
];

export const getService = (id: ServiceId | null | undefined): ServiceDefinition | null =>
  SERVICES.find((s) => s.id === id) ?? null;

export const isServiceId = (value: unknown): value is ServiceId =>
  typeof value === 'string' && SERVICES.some((s) => s.id === value);

export const merchantsForService = (merchants: readonly Merchant[], service: ServiceDefinition | null): Merchant[] =>
  service?.matches ? merchants.filter(service.matches) : [...merchants];
