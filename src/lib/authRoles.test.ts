import { describe, expect, it } from "vitest";
import { isAdminUser, isCustomerUser } from "./authRoles";

describe("auth role helpers", () => {
  it("recognizes the legacy admin email", () => {
    expect(
      isAdminUser({
        email: "admin@clickeats.com",
        app_metadata: {},
      })
    ).toBe(true);
  });

  it("recognizes configured admin email and app_metadata role", () => {
    expect(isAdminUser({ email: "owner@example.com" }, "owner@example.com")).toBe(true);
    expect(
      isAdminUser({
        email: "another@example.com",
        app_metadata: { role: "admin" },
      })
    ).toBe(true);
  });

  it("does not trust user_metadata for admin", () => {
    expect(
      isAdminUser({
        email: "customer@example.com",
        user_metadata: { role: "admin" },
      })
    ).toBe(false);
  });
});

describe("isCustomerUser", () => {
  it("treats an authed user without a staff/admin/rider role as a customer", () => {
    expect(isCustomerUser({ email: "buyer@example.com", app_metadata: {} })).toBe(true);
  });

  it("is false for null and undefined users", () => {
    expect(isCustomerUser(null)).toBe(false);
    expect(isCustomerUser(undefined)).toBe(false);
  });

  it("is false for admin, staff and rider users", () => {
    expect(isCustomerUser({ email: "admin@clickeats.com", app_metadata: {} })).toBe(false);
    expect(
      isCustomerUser({ email: "a@example.com", app_metadata: { role: "admin" } })
    ).toBe(false);
    expect(
      isCustomerUser({ email: "s@example.com", app_metadata: { role: "staff" } })
    ).toBe(false);
    expect(
      isCustomerUser({ email: "r@example.com", app_metadata: { role: "rider" } })
    ).toBe(false);
  });

  it("is false when the configured admin email matches", () => {
    expect(isCustomerUser({ email: "owner@example.com" }, "owner@example.com")).toBe(false);
  });

  it("does not trust user_metadata to escape customer status checks", () => {
    expect(
      isCustomerUser({ email: "buyer@example.com", user_metadata: { role: "admin" } })
    ).toBe(true);
  });
});
