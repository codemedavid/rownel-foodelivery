const LEGACY_ADMIN_EMAIL = "admin@clickeats.com";

type UserLike = {
  email?: string | null;
  app_metadata?: { role?: unknown } | null;
  user_metadata?: { role?: unknown } | null;
};

function normalizeEmail(email?: string | null) {
  return email?.trim().toLowerCase() || null;
}

export function isAdminUser(user: UserLike | null | undefined, adminEmail?: string) {
  if (!user) return false;
  if (user.app_metadata?.role === "admin") return true;

  const email = normalizeEmail(user.email);
  if (!email) return false;

  const configuredAdminEmail = normalizeEmail(adminEmail);
  if (configuredAdminEmail && email === configuredAdminEmail) return true;

  return email === LEGACY_ADMIN_EMAIL;
}

export function isStaffUser(user: UserLike | null | undefined) {
  return user?.app_metadata?.role === "staff";
}

export function isRiderUser(user: UserLike | null | undefined) {
  return user?.app_metadata?.role === "rider";
}

/**
 * A customer is any authenticated user without an operational role.
 * Only app_metadata (server-controlled) is trusted for role checks.
 */
export function isCustomerUser(user: UserLike | null | undefined, adminEmail?: string) {
  if (!user) return false;
  return !isAdminUser(user, adminEmail) && !isStaffUser(user) && !isRiderUser(user);
}
