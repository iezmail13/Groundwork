import { describe, expect, it } from "vitest";
import { contrastRatio, mix, parseHex, toHex } from "@/lib/theme/color";
import {
  BONE_50,
  DEFAULT_THEME,
  NAVY_900,
  RAIL_DEFAULT,
  checkContrast,
  deriveRail,
  deriveTokens,
  readTheme,
  validateTheme,
} from "@/lib/theme/theme";

describe("colour maths", () => {
  it("round-trips hex", () => {
    expect(toHex(parseHex("#1f2d4d"))).toBe("#1F2D4D");
  });

  it("computes WCAG contrast", () => {
    expect(contrastRatio("#000000", "#FFFFFF")).toBeCloseTo(21, 5);
    expect(contrastRatio("#FFFFFF", "#FFFFFF")).toBeCloseTo(1, 5);
    // a known pair: #777777 on white is ~4.48:1
    expect(contrastRatio("#777777", "#FFFFFF")).toBeCloseTo(4.48, 2);
  });

  it("mixes as a solid colour", () => {
    expect(mix("#000000", "#FFFFFF", 0.5)).toBe("#808080");
    expect(mix(NAVY_900, BONE_50, 1)).toBe(NAVY_900);
  });
});

describe("theme derivation", () => {
  it("uses the brief's rail colour for the default navy", () => {
    expect(deriveRail(NAVY_900)).toBe(RAIL_DEFAULT);
    expect(deriveTokens(DEFAULT_THEME).rail).toBe(RAIL_DEFAULT);
  });

  it("derives the rail from a custom navy at about 75% over bone", () => {
    const rail = deriveRail("#22335A");
    expect(rail).toBe(mix("#22335A", BONE_50, 0.76));
  });

  it("passes every contrast check for the default theme in both modes", () => {
    for (const mode of ["light", "dark"] as const) {
      const checks = checkContrast(deriveTokens({ navy: NAVY_900, mode }));
      for (const c of checks) expect(c.ratio, `${mode}: ${c.pair}`).toBeGreaterThanOrEqual(4.5);
    }
  });

  it("dark mode inverts the scales: bone text on deep navy", () => {
    const tokens = deriveTokens({ navy: NAVY_900, mode: "dark" });
    expect(tokens.ink).toBe(BONE_50);
    expect(contrastRatio(tokens.canvas, "#000000")).toBeLessThan(contrastRatio(NAVY_900, "#000000"));
  });
});

describe("theme validation", () => {
  it("accepts a slightly different navy", () => {
    expect(validateTheme({ navy: "#243A63", mode: "light" }).ok).toBe(true);
  });

  it("rejects a navy that drops text contrast below 4.5:1", () => {
    const result = validateTheme({ navy: "#4F6A9A", mode: "light" });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toMatch(/below 4.5:1/);
      expect(result.checks.some((c) => !c.passes)).toBe(true);
    }
  });

  it("rejects a light navy in dark mode when the rail text fails", () => {
    const result = validateTheme({ navy: "#5A78B0", mode: "dark" });
    expect(result.ok).toBe(false);
  });

  it("rejects colours outside the navy family", () => {
    for (const navy of ["#B22222", "#2E7D32", "#C77700", "#808000", "#555555"]) {
      expect(validateTheme({ navy, mode: "light" }).ok, navy).toBe(false);
    }
  });

  it("rejects malformed input", () => {
    expect(validateTheme({ navy: "navy", mode: "light" }).ok).toBe(false);
  });

  it("falls back to the default when stored JSON is invalid or fails contrast", () => {
    expect(readTheme(null)).toEqual(DEFAULT_THEME);
    expect(readTheme({ navy: "#4F6A9A", mode: "light" })).toEqual(DEFAULT_THEME);
    expect(readTheme({ navy: "#243a63", mode: "dark" })).toEqual({ navy: "#243A63", mode: "dark" });
  });
});
