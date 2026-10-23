import { describe, expect, it } from "vitest";
import { canGrant, canManageMember, canManageOrg, canMoveTask, grantableRoles, outrankedByCreator, rankOf, ROLES, type Viewer } from "@/lib/roles";

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

describe("creator protection", () => {
  const admin: Viewer = { userId: "u-admin", role: "admin", membershipId: "m-admin" };

  it("blocks only people ranked below the creator's role, never the creator", () => {
    expect(outrankedByCreator(admin, "u-manager", "manager")).toBe(true);
    expect(outrankedByCreator(admin, "u-other-admin", "admin")).toBe(false);
    expect(outrankedByCreator(admin, "u-staff", "staff")).toBe(false);
    expect(outrankedByCreator({ ...admin, role: "staff" }, "u-admin", "manager")).toBe(false);
    expect(outrankedByCreator(admin, null, null)).toBe(false);
    expect(outrankedByCreator(admin, null, "owner")).toBe(true);
  });

  it("still lets the assignee move a protected task", () => {
    const task = { created_by: "u-owner", created_by_role: "owner" as const, assignees: [{ membership_id: "m-admin" }] };
    expect(canMoveTask(admin, task)).toBe(true);
    expect(canMoveTask(admin, { ...task, assignees: [{ membership_id: "m-someone" }] })).toBe(false);
    expect(canMoveTask(admin, { ...task, assignees: [{ membership_id: "m-someone" }, { membership_id: "m-admin" }] })).toBe(true);
  });
});
