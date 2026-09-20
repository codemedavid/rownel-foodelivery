// Deep links into the device's dialer. Simulators and tablets have no phone
// app, so opening a tel: URL can reject — callers get a boolean, never a throw.

import { Linking } from 'react-native';

const DIALABLE = /[0-9]/;

/** tel: URL for the number, or null when there is nothing dialable. */
export const buildTelUrl = (phone?: string | null): string | null => {
  const raw = phone?.trim();
  if (!raw || !DIALABLE.test(raw)) return null;
  const plus = raw.startsWith('+') ? '+' : '';
  const digits = raw.replace(/[^0-9]/g, '');
  return digits ? `tel:${plus}${digits}` : null;
};

/** Opens the dialer. Resolves false when there is no number or no dialer. */
export const openDialer = async (phone?: string | null): Promise<boolean> => {
  const url = buildTelUrl(phone);
  if (!url) return false;
  try {
    await Linking.openURL(url);
    return true;
  } catch (err) {
    if (__DEV__) console.warn('Could not open dialer:', err);
    return false;
  }
};
