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

  it("rejects control characters and backslashes that browsers normalise into //", () => {
    for (const evil of ["/\t/evil.com", "/\n/evil.com", "/\r/evil.com", "/\t\\evil.com", "/%09/evil.com".replace("%09", "\t"), "/\u0000/evil"]) {
      expect(safeNext(evil), JSON.stringify(evil)).toBe("/");
    }
    // the same value as it arrives from a query string
    expect(safeNext(new URLSearchParams("next=%2F%09%2Fevil.com").get("next"))).toBe("/");
  });

  it("keeps the path, query and hash of a legitimate target", () => {
    expect(safeNext("/invite/abc?x=1#top")).toBe("/invite/abc?x=1#top");
    expect(safeNext("/a/../b")).toBe("/b");
  });
});
