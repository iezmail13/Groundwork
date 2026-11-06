import { describe, expect, it } from "vitest";
import { canEdit, type Viewer } from "@/lib/can-edit";

const P = "11111111-1111-4111-8111-111111111111";
const Q = "22222222-2222-4222-8222-222222222222";
const viewer = (role: Viewer["role"], ranks: [string, number][] = [], grants: Viewer["grants"] = []): Viewer => ({
  role,
  projectRanks: new Map(ranks),
  grants,
});

describe("canEdit", () => {
  it("lets a program's admins and leads run its work and page, not its staff", () => {
    expect(canEdit({ kind: "project_work", projectId: P }, viewer("staff", [[P, 2]]))).toBe(true);
    expect(canEdit({ kind: "project", projectId: P }, viewer("admin", [[P, 3]]))).toBe(true);
    expect(canEdit({ kind: "project_work", projectId: P }, viewer("admin", [[P, 1]]))).toBe(false);
    expect(canEdit({ kind: "project", projectId: Q }, viewer("manager", [[P, 3]]))).toBe(false);
  });

  it("lets owners act everywhere", () => {
    const owner = viewer("owner");
    expect(canEdit({ kind: "project", projectId: Q }, owner)).toBe(true);
    expect(canEdit({ kind: "participant", projectId: Q }, owner)).toBe(true);
    expect(canEdit({ kind: "fund" }, owner)).toBe(true);
  });

  it("keeps funds, workload and work outside any program for managers and owners", () => {
    expect(canEdit({ kind: "fund" }, viewer("manager"))).toBe(true);
    expect(canEdit({ kind: "person" }, viewer("admin"))).toBe(false);
    expect(canEdit({ kind: "project_work", projectId: null }, viewer("admin", [[P, 3]]))).toBe(false);
    expect(canEdit({ kind: "project_work", projectId: null }, viewer("manager"))).toBe(true);
  });

  it("always lets people act on their own work", () => {
    expect(canEdit({ kind: "own_work" }, viewer("staff"))).toBe(true);
  });

  it("honours a per-person grant first (the extension point)", () => {
    expect(canEdit({ kind: "project_work", projectId: P }, viewer("staff", [[P, 1]], [{ target: "project_work", id: P }]))).toBe(true);
  });
});
