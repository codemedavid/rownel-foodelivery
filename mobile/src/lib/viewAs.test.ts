import {
  canViewAs,
  effectiveRoleContext,
  effectiveUserId,
  roleContextForViewAs,
  viewAsLabel,
  viewAsTargetFromRider,
  viewAsTargetFromStaff,
  type ViewAsTarget,
} from './viewAs';
import type { RiderRecord, StaffRecord } from './adminTypes';
import type { RoleContext } from './roles';

const adminContext: RoleContext = {
  role: 'admin',
  isAdmin: true,
  isStaff: true,
  merchantIds: [],
  allMerchants: true,
};

const staffContext: RoleContext = {
  role: 'staff',
  isAdmin: false,
  isStaff: true,
  merchantIds: ['m1'],
  allMerchants: false,
};

const staffRow = (overrides: Partial<StaffRecord> = {}): StaffRecord => ({
  id: 's1',
  supabaseUserId: 'user-staff',
  email: 's@x.com',
  name: 'Sam Staff',
  merchantIds: ['m1', 'm2'],
  allMerchants: false,
  isActive: true,
  createdAt: 0,
  ...overrides,
});

const riderRow = (overrides: Partial<RiderRecord> = {}): RiderRecord => ({
  id: 'user-rider',
  name: 'Rita Rider',
  phone: '0917',
  plateNumber: 'ABC 123',
  vehicleType: 'motorcycle',
  isApproved: true,
  isActive: true,
  ratingSum: 0,
  ratingCount: 0,
  createdAt: 0,
  ...overrides,
});

const riderTarget: ViewAsTarget = {
  userId: 'user-rider',
  role: 'rider',
  name: 'Rita Rider',
  merchantIds: [],
  allMerchants: false,
};

describe('canViewAs', () => {
  it('allows admins', () => {
    expect(canViewAs(adminContext)).toBe(true);
  });

  it('denies merchant-scoped staff', () => {
    expect(canViewAs(staffContext)).toBe(false);
  });
});

describe('viewAsTargetFromStaff', () => {
  it('maps a merchant-scoped staff row to a staff target', () => {
    expect(viewAsTargetFromStaff(staffRow())).toEqual({
      userId: 'user-staff',
      role: 'staff',
      name: 'Sam Staff',
      merchantIds: ['m1', 'm2'],
      allMerchants: false,
    });
  });

  it('maps an all-merchants staff row to an admin target', () => {
    const target = viewAsTargetFromStaff(staffRow({ allMerchants: true }));
    expect(target.role).toBe('admin');
    expect(target.allMerchants).toBe(true);
    expect(target.merchantIds).toEqual([]);
  });
});

describe('viewAsTargetFromRider', () => {
  it('keys the target off the rider auth id', () => {
    expect(viewAsTargetFromRider(riderRow())).toEqual({
      userId: 'user-rider',
      role: 'rider',
      name: 'Rita Rider',
      merchantIds: [],
      allMerchants: false,
    });
  });
});

describe('roleContextForViewAs', () => {
  it('scopes a staff target to its merchants without admin rights', () => {
    const ctx = roleContextForViewAs(viewAsTargetFromStaff(staffRow()));
    expect(ctx).toEqual({
      role: 'staff',
      isAdmin: false,
      isStaff: true,
      merchantIds: ['m1', 'm2'],
      allMerchants: false,
    });
  });

  it('gives a rider target the rider role with no merchant access', () => {
    expect(roleContextForViewAs(riderTarget)).toEqual({
      role: 'rider',
      isAdmin: false,
      isStaff: false,
      merchantIds: [],
      allMerchants: false,
    });
  });

  it('keeps admin rights for an all-merchants target', () => {
    expect(roleContextForViewAs(viewAsTargetFromStaff(staffRow({ allMerchants: true }))).isAdmin).toBe(
      true
    );
  });
});

describe('effectiveRoleContext', () => {
  it('returns the real context when nothing is being previewed', () => {
    expect(effectiveRoleContext(adminContext, null)).toBe(adminContext);
  });

  it('swaps in the target context for an admin', () => {
    expect(effectiveRoleContext(adminContext, riderTarget).role).toBe('rider');
  });

  it('ignores a target set by a non-admin', () => {
    expect(effectiveRoleContext(staffContext, riderTarget)).toBe(staffContext);
  });
});

describe('effectiveUserId', () => {
  it('returns the real user id with no target', () => {
    expect(effectiveUserId('admin-1', null)).toBe('admin-1');
  });

  it('returns the target user id while previewing', () => {
    expect(effectiveUserId('admin-1', riderTarget)).toBe('user-rider');
  });

  it('returns null for a signed-out user', () => {
    expect(effectiveUserId(null, null)).toBeNull();
  });
});

describe('viewAsLabel', () => {
  it('names the account and its role', () => {
    expect(viewAsLabel(riderTarget)).toBe('Viewing as Rita Rider · rider');
  });
});
