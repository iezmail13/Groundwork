import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { contrastRatio, mix, parseHex, toHex } from "@/lib/theme/color";
import { BONE_50, NAVY_900, checkContrast, deriveTokens, type ThemeTokens } from "@/lib/theme/theme";

describe("colour maths", () => {
  it("round-trips hex", () => {
    expect(toHex(parseHex("#163260"))).toBe("#163260");
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

describe("the fixed theme", () => {
  const tokens = deriveTokens();

  it("is built on navy #163260", () => {
    expect(NAVY_900).toBe("#163260");
    expect(tokens.ink).toBe(NAVY_900);
    expect(tokens.primary).toBe(NAVY_900);
  });

  it("derives the rail at about 75% navy over bone", () => {
    expect(tokens.rail).toBe(mix(NAVY_900, BONE_50, 0.76));
  });

  it("keeps every text pair at 4.5:1 or more", () => {
    for (const c of checkContrast(tokens)) expect(c.ratio, c.pair).toBeGreaterThanOrEqual(4.5);
  });

  it("matches the custom properties in app/globals.css", () => {
    const css = readFileSync("app/globals.css", "utf8");
    const root = css.slice(css.indexOf(":root {"), css.indexOf("}", css.indexOf(":root {")));
    const vars = new Map([...root.matchAll(/--([\w-]+):\s*([^;]+);/g)].map((m) => [m[1]!, m[2]!.trim()]));
    const resolve = (name: string): string => {
      const value = vars.get(name) ?? "";
      const ref = /^var\(--([\w-]+)\)$/.exec(value);
      return (ref ? resolve(ref[1]!) : value).toUpperCase();
    };
    const names: Record<keyof ThemeTokens, string> = {
      canvas: "canvas",
      panel: "panel",
      rule: "rule",
      ink: "ink",
      inkMuted: "ink-muted",
      rail: "rail",
      railInk: "rail-ink",
      railInkMuted: "rail-ink-muted",
      railHover: "rail-hover",
      primary: "primary",
      onPrimary: "on-primary",
      activeBg: "active-bg",
      activeInk: "active-ink",
      tint: "tint",
    };
    for (const [token, cssName] of Object.entries(names)) {
      expect(resolve(cssName), `--${cssName}`).toBe(tokens[token as keyof ThemeTokens]);
    }
  });
});
