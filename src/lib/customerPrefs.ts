/**
 * Small, device-local customer preferences so a guest never has to retype
 * their name and number, and the service they picked on Home carries into
 * checkout.
 */

const CONTACT_KEY = 'rownel:customer-contact';
const FULFILMENT_KEY = 'rownel:fulfilment';

export interface CustomerContact {
  name: string;
  contactNumber: string;
  landmark?: string;
}

export interface FulfilmentPreference {
  serviceType: 'delivery' | 'pickup';
  deliveryMode: 'priority' | 'economy';
}

const DEFAULT_FULFILMENT: FulfilmentPreference = { serviceType: 'delivery', deliveryMode: 'priority' };

const readJson = <T>(key: string): T | null => {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
};

const writeJson = (key: string, value: unknown): void => {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // storage disabled — preferences simply won't persist
  }
};

export function readCustomerContact(): CustomerContact | null {
  const parsed = readJson<Partial<CustomerContact>>(CONTACT_KEY);
  if (!parsed || typeof parsed.name !== 'string' || typeof parsed.contactNumber !== 'string') return null;
  return { name: parsed.name, contactNumber: parsed.contactNumber, landmark: parsed.landmark ?? undefined };
}

export function saveCustomerContact(contact: CustomerContact): void {
  writeJson(CONTACT_KEY, contact);
}

export function readFulfilmentPreference(): FulfilmentPreference {
  const parsed = readJson<Partial<FulfilmentPreference>>(FULFILMENT_KEY);
  return {
    serviceType: parsed?.serviceType === 'pickup' ? 'pickup' : DEFAULT_FULFILMENT.serviceType,
    deliveryMode: parsed?.deliveryMode === 'economy' ? 'economy' : DEFAULT_FULFILMENT.deliveryMode,
  };
}

export function saveFulfilmentPreference(update: Partial<FulfilmentPreference>): FulfilmentPreference {
  const next = { ...readFulfilmentPreference(), ...update };
  writeJson(FULFILMENT_KEY, next);
  return next;
}

/** Philippine mobile numbers: 09XXXXXXXXX or +639XXXXXXXXX, spaces/dashes tolerated. */
export function isValidPhMobile(value: string): boolean {
  const digits = value.replace(/[\s-]/g, '');
  return /^(09\d{9}|\+639\d{9}|639\d{9})$/.test(digits);
}
