import { isAdminUser, isCustomerUser, isRiderUser, isStaffUser } from './authRoles';

describe('authRoles', () => {
  it('treats app_metadata.role admin as admin', () => {
    expect(isAdminUser({ email: 'x@y.com', app_metadata: { role: 'admin' } })).toBe(true);
  });

  it('treats the legacy admin email as admin regardless of case', () => {
    expect(isAdminUser({ email: 'Admin@ClickEats.com' })).toBe(true);
  });

  it('treats a configured admin email as admin', () => {
    expect(isAdminUser({ email: 'boss@shop.ph' }, 'BOSS@shop.ph')).toBe(true);
  });

  it('does not trust user_metadata for admin', () => {
    expect(isAdminUser({ email: 'a@b.c', user_metadata: { role: 'admin' } })).toBe(false);
  });

  it('returns false for null users', () => {
    expect(isAdminUser(null)).toBe(false);
    expect(isStaffUser(null)).toBe(false);
    expect(isRiderUser(undefined)).toBe(false);
    expect(isCustomerUser(null)).toBe(false);
  });

  it('detects staff and rider roles', () => {
    expect(isStaffUser({ app_metadata: { role: 'staff' } })).toBe(true);
    expect(isRiderUser({ app_metadata: { role: 'rider' } })).toBe(true);
    expect(isStaffUser({ app_metadata: { role: 'rider' } })).toBe(false);
  });

  it('treats any authenticated user without an operational role as a customer', () => {
    expect(isCustomerUser({ email: 'me@x.com', app_metadata: {} })).toBe(true);
    expect(isCustomerUser({ email: 'me@x.com', app_metadata: { role: 'staff' } })).toBe(false);
  });
});
