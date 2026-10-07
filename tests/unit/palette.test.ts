import { describe, expect, it } from "vitest";
import { PROJECT_COLORS } from "@/lib/palette";
import { BONE_50, BONE_300, NAVY_900 } from "@/lib/theme/theme";
import { mix } from "@/lib/theme/color";
import { safeNext } from "@/lib/safe-next";

describe("project palette", () => {
  it("only contains tints and shades of navy and bone", () => {
    const allowed = new Set<string>([
      NAVY_900,
      BONE_300,
      mix(NAVY_900, BONE_50, 0.8),
      mix(NAVY_900, BONE_50, 0.6),
      mix(NAVY_900, BONE_50, 0.4),
      mix(NAVY_900, "#000000", 0.5),
    ]);
    for (const c of PROJECT_COLORS) expect(allowed.has(c.value), `${c.name} ${c.value}`).toBe(true);
  });
});

describe("safeNext", () => {
  it("allows same-site paths only", () => {
    expect(safeNext("/acme/tasks")).toBe("/acme/tasks");
    expect(safeNext("//evil.example")).toBe("/");
    expect(safeNext("https://evil.example")).toBe("/");
    expect(safeNext("/\\evil")).toBe("/");
    expect(safeNext(undefined, "/x")).toBe("/x");
  });
});
