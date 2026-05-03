import { describe, expect, it } from "vitest";
import { isAdminUser } from "./authRoles";

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
