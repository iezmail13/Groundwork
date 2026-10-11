import { describe, expect, it } from "vitest";
import { canGrant, canManageMember, canManageOrg, grantableRoles, rankOf, ROLES } from "@/lib/roles";

describe("role ladder", () => {
  it("ranks owner > manager > admin > staff", () => {
    expect(ROLES.map(rankOf)).toEqual([4, 3, 2, 1]);
  });

  it("lets owners and managers manage the organization", () => {
    expect(ROLES.filter(canManageOrg)).toEqual(["owner", "manager"]);
  });

  it("lets owners grant every role and managers only roles below theirs", () => {
    expect(grantableRoles("owner")).toEqual(["owner", "manager", "admin", "staff"]);
    expect(grantableRoles("manager")).toEqual(["admin", "staff"]);
    expect(grantableRoles("admin")).toEqual([]);
    expect(grantableRoles("staff")).toEqual([]);
  });

  it("never lets a manager change a peer or an owner", () => {
    expect(canManageMember("manager", "manager")).toBe(false);
    expect(canManageMember("manager", "owner")).toBe(false);
    expect(canManageMember("manager", "admin")).toBe(true);
    expect(canManageMember("owner", "owner")).toBe(true);
    expect(canGrant("admin", "staff")).toBe(false);
  });
});
