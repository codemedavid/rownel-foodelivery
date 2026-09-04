// Ported verbatim from the web app's src/lib/authRoles.ts. Only app_metadata
// (server-controlled) is trusted for role checks.

const LEGACY_ADMIN_EMAIL = 'admin@clickeats.com';

export interface UserLike {
  email?: string | null;
  app_metadata?: { role?: unknown; [key: string]: unknown } | null;
  user_metadata?: { role?: unknown; [key: string]: unknown } | null;
}

const normalizeEmail = (email?: string | null): string | null =>
  email?.trim().toLowerCase() || null;

export const isAdminUser = (user: UserLike | null | undefined, adminEmail?: string): boolean => {
  if (!user) return false;
  if (user.app_metadata?.role === 'admin') return true;

  const email = normalizeEmail(user.email);
  if (!email) return false;

  const configuredAdminEmail = normalizeEmail(adminEmail);
  if (configuredAdminEmail && email === configuredAdminEmail) return true;

  return email === LEGACY_ADMIN_EMAIL;
};

export const isStaffUser = (user: UserLike | null | undefined): boolean =>
  user?.app_metadata?.role === 'staff';

export const isRiderUser = (user: UserLike | null | undefined): boolean =>
  user?.app_metadata?.role === 'rider';

/** A customer is any authenticated user without an operational role. */
export const isCustomerUser = (user: UserLike | null | undefined, adminEmail?: string): boolean => {
  if (!user) return false;
  return !isAdminUser(user, adminEmail) && !isStaffUser(user) && !isRiderUser(user);
};
