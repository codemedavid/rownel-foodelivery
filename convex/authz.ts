const LEGACY_ADMIN_EMAIL = "admin@clickeats.com";

type IdentityLike = {
  email?: unknown;
  app_metadata?: unknown;
  appMetadata?: unknown;
  [key: string]: unknown;
};

type StaffLike = {
  isActive?: boolean;
  allMerchants?: boolean;
} | null | undefined;

function parseMetadata(value: unknown): Record<string, unknown> | null {
  if (!value) return null;
  if (typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  if (typeof value !== "string") return null;
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

export function getMetadataRole(identity: IdentityLike | null | undefined): string | null {
  const metadata =
    parseMetadata(identity?.app_metadata) ??
    parseMetadata(identity?.appMetadata);
  const role = metadata?.role;
  return typeof role === "string" ? role : null;
}

function normalizeEmail(value: unknown): string | null {
  return typeof value === "string" && value.trim()
    ? value.trim().toLowerCase()
    : null;
}

export function isAdminIdentity({
  identity,
  staff,
  adminEmail = process.env.ADMIN_EMAIL ?? process.env.VITE_ADMIN_EMAIL,
}: {
  identity: IdentityLike;
  staff?: StaffLike;
  adminEmail?: string;
}): boolean {
  if (staff?.isActive && staff.allMerchants) return true;
  if (getMetadataRole(identity) === "admin") return true;

  const identityEmail = normalizeEmail(identity.email);
  if (!identityEmail) return false;

  const configuredAdminEmail = normalizeEmail(adminEmail);
  if (configuredAdminEmail && identityEmail === configuredAdminEmail) return true;

  return identityEmail === LEGACY_ADMIN_EMAIL;
}

export async function requireAuth(ctx: any) {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) throw new Error("Unauthorized");
  return identity;
}

export async function getStaffBySupabaseUser(ctx: any, supabaseUserId: string) {
  return ctx.db
    .query("staff")
    .withIndex("by_supabase_user", (q: any) => q.eq("supabaseUserId", supabaseUserId))
    .first();
}

export async function requireAdmin(ctx: any) {
  const identity = await requireAuth(ctx);
  const staff = await getStaffBySupabaseUser(ctx, identity.subject);
  if (!isAdminIdentity({ identity, staff })) {
    throw new Error("Unauthorized: Admin access required");
  }
  return { identity, staff };
}

export async function requireStaff(ctx: any) {
  const identity = await requireAuth(ctx);
  const staff = await getStaffBySupabaseUser(ctx, identity.subject);
  if (!staff || !staff.isActive) {
    throw new Error("Unauthorized: Staff access required");
  }
  return { identity, staff };
}

export async function requireStaffForMerchant(ctx: any, merchantId: string) {
  const { identity, staff } = await requireStaff(ctx);
  if (!staff.allMerchants) {
    const ids: string[] = staff.merchantIds ?? (staff.merchantId ? [staff.merchantId] : []);
    if (!ids.includes(merchantId)) {
      throw new Error("Unauthorized: No access to this merchant");
    }
  }
  return { identity, staff };
}
