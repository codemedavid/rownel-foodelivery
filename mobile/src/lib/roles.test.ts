import {
  canAccessAdminTab,
  canAccessRiderTab,
  deriveRoleContext,
  groupForRole,
  landingRouteFor,
} from './roles';
import type { StaffRecord } from './adminTypes';

const staff = (overrides: Partial<StaffRecord> = {}): StaffRecord => ({
  id: 's1',
  supabaseUserId: 'u1',
  email: 's@x.com',
  name: 'Staff',
  merchantIds: ['m1'],
  allMerchants: false,
  isActive: true,
  createdAt: 0,
  ...overrides,
});

describe('deriveRoleContext', () => {
  it('returns customer for a guest', () => {
    const ctx = deriveRoleContext(null, null);
    expect(ctx).toEqual({ role: 'customer', isAdmin: false, isStaff: false, merchantIds: [], allMerchants: false });
  });

  it('returns customer for a signed-in user without roles', () => {
    expect(deriveRoleContext({ email: 'c@x.com', app_metadata: {} }, null).role).toBe('customer');
  });

  it('returns admin for app_metadata admin even without a staff row', () => {
    const ctx = deriveRoleContext({ email: 'a@x.com', app_metadata: { role: 'admin' } }, null);
    expect(ctx.role).toBe('admin');
    expect(ctx.isAdmin).toBe(true);
    expect(ctx.isStaff).toBe(true);
    expect(ctx.allMerchants).toBe(true);
  });

  it('promotes active staff with allMerchants to admin', () => {
    const ctx = deriveRoleContext({ app_metadata: { role: 'staff' } }, staff({ allMerchants: true }));
    expect(ctx.role).toBe('admin');
    expect(ctx.allMerchants).toBe(true);
  });

  it('returns merchant-scoped staff for an active staff row', () => {
    const ctx = deriveRoleContext({ app_metadata: { role: 'staff' } }, staff({ merchantIds: ['m1', 'm2'] }));
    expect(ctx.role).toBe('staff');
    expect(ctx.isAdmin).toBe(false);
    expect(ctx.merchantIds).toEqual(['m1', 'm2']);
  });

  it('keeps staff role from app_metadata when the row is missing, with no merchants', () => {
    const ctx = deriveRoleContext({ app_metadata: { role: 'staff' } }, null);
    expect(ctx.role).toBe('staff');
    expect(ctx.merchantIds).toEqual([]);
  });

  it('demotes an inactive staff row without a JWT role to customer', () => {
    const ctx = deriveRoleContext({ app_metadata: {} }, staff({ isActive: false }));
    expect(ctx.role).toBe('customer');
  });

  it('returns rider for app_metadata rider', () => {
    expect(deriveRoleContext({ app_metadata: { role: 'rider' } }, null).role).toBe('rider');
  });
});

describe('landingRouteFor', () => {
  it('sends operational roles to the admin orders screen', () => {
    expect(landingRouteFor('admin')).toBe('/(admin)/orders');
    expect(landingRouteFor('staff')).toBe('/(admin)/orders');
  });

  it('sends riders to their own dashboard', () => {
    expect(landingRouteFor('rider')).toBe('/(rider)');
  });

  it('sends customers to the storefront tabs', () => {
    expect(landingRouteFor('customer')).toBe('/(tabs)');
  });
});

describe('groupForRole', () => {
  it('maps each role to the route group it belongs in', () => {
    expect(groupForRole('admin')).toBe('(admin)');
    expect(groupForRole('staff')).toBe('(admin)');
    expect(groupForRole('rider')).toBe('(rider)');
    expect(groupForRole('customer')).toBe('(tabs)');
  });
});

describe('canAccessRiderTab', () => {
  const riderCtx = deriveRoleContext({ app_metadata: { role: 'rider' } }, null);
  const customerCtx = deriveRoleContext({ app_metadata: {} }, null);

  it('lets riders into every rider tab', () => {
    for (const tab of ['index', 'deliveries', 'earnings', 'profile'] as const) {
      expect(canAccessRiderTab(riderCtx, tab)).toBe(true);
    }
  });

  it('keeps non-riders out', () => {
    expect(canAccessRiderTab(customerCtx, 'index')).toBe(false);
    expect(canAccessRiderTab(deriveRoleContext({ app_metadata: { role: 'admin' } }, null), 'earnings')).toBe(false);
  });
});

describe('canAccessAdminTab', () => {
  const adminCtx = deriveRoleContext({ app_metadata: { role: 'admin' } }, null);
  const staffCtx = deriveRoleContext({ app_metadata: { role: 'staff' } }, staff());

  it('lets admins into every tab', () => {
    for (const tab of ['orders', 'analytics', 'staff', 'riders', 'settings'] as const) {
      expect(canAccessAdminTab(adminCtx, tab)).toBe(true);
    }
  });

  it('limits staff to orders and settings', () => {
    expect(canAccessAdminTab(staffCtx, 'orders')).toBe(true);
    expect(canAccessAdminTab(staffCtx, 'settings')).toBe(true);
    expect(canAccessAdminTab(staffCtx, 'analytics')).toBe(false);
    expect(canAccessAdminTab(staffCtx, 'staff')).toBe(false);
    expect(canAccessAdminTab(staffCtx, 'riders')).toBe(false);
  });
});
