import { describe, expect, it } from "vitest";
import { getMetadataRole, isAdminIdentity } from "../../convex/authz";

describe("Convex authz helpers", () => {
  it("allows the legacy admin email without requiring a staff row", () => {
    expect(
      isAdminIdentity({
        identity: { subject: "user-1", email: "admin@clickeats.com" },
        staff: null,
      })
    ).toBe(true);
  });

  it("allows active all-merchant staff", () => {
    expect(
      isAdminIdentity({
        identity: { subject: "staff-1", email: "staff@example.com" },
        staff: { isActive: true, allMerchants: true },
      })
    ).toBe(true);
  });

  it("allows a non-forgeable app_metadata admin role", () => {
    expect(
      isAdminIdentity({
        identity: {
          subject: "admin-1",
          email: "owner@example.com",
          app_metadata: { role: "admin" },
        },
        staff: null,
      })
    ).toBe(true);
  });

  it("reads metadata roles from JSON strings too", () => {
    expect(
      getMetadataRole({ app_metadata: JSON.stringify({ role: "admin" }) })
    ).toBe("admin");
  });

  it("rejects inactive staff and non-admin identities", () => {
    expect(
      isAdminIdentity({
        identity: { subject: "staff-2", email: "staff@example.com" },
        staff: { isActive: false, allMerchants: true },
      })
    ).toBe(false);

    expect(
      isAdminIdentity({
        identity: { subject: "rider-1", email: "rider@example.com" },
        staff: null,
      })
    ).toBe(false);
  });
});
