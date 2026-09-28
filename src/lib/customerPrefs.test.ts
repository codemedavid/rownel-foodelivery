import { beforeEach, describe, expect, it } from 'vitest';
import { isValidPhMobile, readCustomerContact, saveCustomerContact } from './customerPrefs';

describe('customerPrefs', () => {
  beforeEach(() => localStorage.clear());

  it('remembers contact details across visits', () => {
    expect(readCustomerContact()).toBeNull();
    saveCustomerContact({ name: 'Juan', contactNumber: '09171234567', landmark: 'Near the chapel' });
    expect(readCustomerContact()).toEqual({ name: 'Juan', contactNumber: '09171234567', landmark: 'Near the chapel' });
  });

  it('validates Philippine mobile numbers', () => {
    expect(isValidPhMobile('0917 123 4567')).toBe(true);
    expect(isValidPhMobile('+639171234567')).toBe(true);
    expect(isValidPhMobile('639171234567')).toBe(true);
    expect(isValidPhMobile('12345')).toBe(false);
    expect(isValidPhMobile('0917123456')).toBe(false);
  });
});
