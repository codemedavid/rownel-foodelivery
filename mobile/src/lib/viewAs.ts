// "View as" (impersonation-lite): an admin previews the staff or rider surface
// without signing in as them. It is strictly READ-ONLY — the Supabase session
// still belongs to the admin, so every mutation would be attributed to the
// admin's own auth.uid(). Screens disable their actions while a target is set.

import type { RiderRecord, StaffRecord } from './adminTypes';
import type { AppRole, RoleContext } from './roles';

export type ViewAsRole = Extract<AppRole, 'admin' | 'staff' | 'rider'>;

export interface ViewAsTarget {
  /** Auth user id of the impersonated account. */
  readonly userId: string;
  readonly role: ViewAsRole;
  readonly name: string;
  readonly merchantIds: readonly string[];
  readonly allMerchants: boolean;
}

/** Only a real admin may preview another account's surface. */
export const canViewAs = (ctx: RoleContext): boolean => ctx.isAdmin;

export const viewAsTargetFromStaff = (staff: StaffRecord): ViewAsTarget => ({
  userId: staff.supabaseUserId,
  role: staff.allMerchants ? 'admin' : 'staff',
  name: staff.name,
  merchantIds: staff.allMerchants ? [] : staff.merchantIds,
  allMerchants: staff.allMerchants,
});

export const viewAsTargetFromRider = (rider: RiderRecord): ViewAsTarget => ({
  userId: rider.id,
  role: 'rider',
  name: rider.name,
  merchantIds: [],
  allMerchants: false,
});

/** The role context the app should behave with while previewing `target`. */
export const roleContextForViewAs = (target: ViewAsTarget): RoleContext => {
  if (target.role === 'admin') {
    return { role: 'admin', isAdmin: true, isStaff: true, merchantIds: [], allMerchants: true };
  }
  if (target.role === 'staff') {
    return {
      role: 'staff',
      isAdmin: false,
      isStaff: true,
      merchantIds: target.merchantIds,
      allMerchants: false,
    };
  }
  return { role: 'rider', isAdmin: false, isStaff: false, merchantIds: [], allMerchants: false };
};

/** Role context the app runs with: the target's while previewing, else the real one. */
export const effectiveRoleContext = (
  realContext: RoleContext,
  target: ViewAsTarget | null
): RoleContext => {
  if (!target || !canViewAs(realContext)) return realContext;
  return roleContextForViewAs(target);
};

/** User id every per-user query should key off while previewing. */
export const effectiveUserId = (
  realUserId: string | null | undefined,
  target: ViewAsTarget | null
): string | null => target?.userId ?? realUserId ?? null;

const ROLE_LABELS: Record<ViewAsRole, string> = {
  admin: 'admin',
  staff: 'staff',
  rider: 'rider',
};

export const viewAsLabel = (target: ViewAsTarget): string =>
  `Viewing as ${target.name} · ${ROLE_LABELS[target.role]}`;
