import { isAdminUser, isRiderUser, isStaffUser, type UserLike } from './authRoles';
import type { StaffRecord } from './adminTypes';

export type AppRole = 'admin' | 'staff' | 'rider' | 'customer';

export interface RoleContext {
  role: AppRole;
  isAdmin: boolean;
  isStaff: boolean;
  merchantIds: readonly string[];
  allMerchants: boolean;
}

export type AdminTab = 'orders' | 'analytics' | 'staff' | 'riders' | 'settings';

export type RiderTab = 'index' | 'deliveries' | 'earnings' | 'profile';

/** Expo Router group each role lives in. */
export type RouteGroup = '(admin)' | '(rider)' | '(tabs)';

const STAFF_TABS: readonly AdminTab[] = ['orders', 'settings'];

export const GUEST_ROLE_CONTEXT: RoleContext = {
  role: 'customer',
  isAdmin: false,
  isStaff: false,
  merchantIds: [],
  allMerchants: false,
};

/**
 * Same precedence as the web AuthContext: an active staff row with
 * all_merchants is an admin; any active staff row or a staff JWT role is staff.
 */
export const deriveRoleContext = (
  user: UserLike | null | undefined,
  staffRecord: StaffRecord | null | undefined,
  adminEmail?: string
): RoleContext => {
  if (!user) return GUEST_ROLE_CONTEXT;

  const activeStaff = staffRecord?.isActive ? staffRecord : null;
  const isAdmin = !!activeStaff?.allMerchants || isAdminUser(user, adminEmail);
  const isStaff = isAdmin || !!activeStaff || isStaffUser(user);

  if (isAdmin) {
    return { role: 'admin', isAdmin: true, isStaff: true, merchantIds: [], allMerchants: true };
  }
  if (isStaff) {
    return {
      role: 'staff',
      isAdmin: false,
      isStaff: true,
      merchantIds: activeStaff?.merchantIds ?? [],
      allMerchants: false,
    };
  }
  if (isRiderUser(user)) {
    return { ...GUEST_ROLE_CONTEXT, role: 'rider' };
  }
  return GUEST_ROLE_CONTEXT;
};

export type LandingRoute = '/(admin)/orders' | '/(rider)' | '/(tabs)';

export const landingRouteFor = (role: AppRole): LandingRoute => {
  if (role === 'admin' || role === 'staff') return '/(admin)/orders';
  if (role === 'rider') return '/(rider)';
  return '/(tabs)';
};

export const groupForRole = (role: AppRole): RouteGroup => {
  if (role === 'admin' || role === 'staff') return '(admin)';
  if (role === 'rider') return '(rider)';
  return '(tabs)';
};

export const isOperationalRole = (role: AppRole): boolean => role === 'admin' || role === 'staff';

export const canAccessAdminTab = (ctx: RoleContext, tab: AdminTab): boolean => {
  if (ctx.isAdmin) return true;
  if (ctx.isStaff) return STAFF_TABS.includes(tab);
  return false;
};

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export const canAccessRiderTab = (ctx: RoleContext, _tab: RiderTab): boolean =>
  ctx.role === 'rider';
