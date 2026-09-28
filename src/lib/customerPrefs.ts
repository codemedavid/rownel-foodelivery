/**
 * Small, device-local customer preferences so a guest never has to retype
 * their name and number.
 */

const CONTACT_KEY = 'rownel:customer-contact';

export interface CustomerContact {
  name: string;
  contactNumber: string;
  landmark?: string;
}

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

/** Philippine mobile numbers: 09XXXXXXXXX or +639XXXXXXXXX, spaces/dashes tolerated. */
export function isValidPhMobile(value: string): boolean {
  const digits = value.replace(/[\s-]/g, '');
  return /^(09\d{9}|\+639\d{9}|639\d{9})$/.test(digits);
}
