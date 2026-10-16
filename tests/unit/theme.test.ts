import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { contrastRatio, fromHsl, mix, parseHex, toHex, toHsl } from "@/lib/theme/color";
import {
  ACCENT_PRESETS,
  BONE_50,
  CSS_NAMES,
  DEFAULT_ACCENT,
  NAVY_900,
  accentStyleSheet,
  checkContrast,
  deriveAccent,
  deriveTokens,
  resolveAccent,
  type Mode,
  type ThemeTokens,
} from "@/lib/theme/theme";

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

  it("round-trips HSL", () => {
    for (const hex of ["#0006BF", "#163260", "#DC2626", "#FBF9F4", "#808080"]) {
      expect(fromHsl(toHsl(hex))).toBe(hex);
    }
  });
});

describe("tokens", () => {
  const modes: Mode[] = ["light", "dark"];

  it("keeps navy #163260 for text and the sidebar, and #0006BF as the default accent", () => {
    const light = deriveTokens("light");
    expect(light.ink).toBe(NAVY_900);
    expect(light.rail).toBe(NAVY_900);
    expect(light.accent).toBe(DEFAULT_ACCENT);
  });

  it("uses the starting status and priority colours (D83)", () => {
    const light = deriveTokens("light");
    expect([light.good, light.warn, light.bad]).toEqual(["#16A34A", "#D97706", "#DC2626"]);
    expect([light.prioCritical, light.prioHigh, light.prioMedium, light.prioLow]).toEqual(["#DC2626", "#EA580C", "#CA8A04", "#2563EB"]);
    const dark = deriveTokens("dark");
    expect([dark.good, dark.warn, dark.bad]).toEqual(["#4ADE80", "#FBBF24", "#F87171"]);
  });

  it("gives dark mode a deep navy canvas derived from #163260 and a lightened accent", () => {
    const dark = deriveTokens("dark");
    expect(dark.canvas).toBe(mix(NAVY_900, "#000000", 0.55));
    const hsl = toHsl(dark.accent);
    expect(Math.round(hsl.h)).toBe(Math.round(toHsl(DEFAULT_ACCENT).h));
    expect(hsl.l).toBeGreaterThan(0.7);
  });

  it.each(modes)("passes every contrast check in %s mode", (mode) => {
    for (const c of checkContrast(deriveTokens(mode))) {
      expect(c.ratio, `${mode}: ${c.pair} (${c.foreground} on ${c.background})`).toBeGreaterThanOrEqual(c.min);
    }
  });

  it.each(modes)("passes in %s mode with every preset and with awkward custom accents", (mode) => {
    const choices = [...ACCENT_PRESETS.map((p) => p.value), "#FFFF00", "#00FF00", "#FFFFFF", "#000000", "#808080", "#FF00FF"];
    for (const choice of choices) {
      for (const c of checkContrast(deriveTokens(mode, choice))) {
        expect(c.ratio, `${mode} ${choice}: ${c.pair}`).toBeGreaterThanOrEqual(c.min);
      }
    }
  });

  it("only changes an accent's lightness, never its hue", () => {
    const yellow = deriveAccent("#FFD000", "light").accent;
    expect(contrastRatio(yellow, BONE_50)).toBeGreaterThanOrEqual(4.5);
    expect(Math.abs(toHsl(yellow).h - toHsl("#FFD000").h)).toBeLessThan(2);
  });

  it("never lets an org or person theme status or priority colours", () => {
    const a = deriveTokens("light", "#7C3AED");
    const b = deriveTokens("light");
    for (const key of ["good", "goodInk", "warn", "bad", "prioCritical", "prioHigh", "prioMedium", "prioLow"] as const) {
      expect(a[key]).toBe(b[key]);
    }
    expect(accentStyleSheet("#7C3AED")).not.toMatch(/--(good|warn|bad|prio)/);
  });
});

describe("accent resolution", () => {
  it("prefers personal, then org, then the default", () => {
    expect(resolveAccent({ accent: "#0F766E", allowPersonalAccent: true }, "#be185d")).toBe("#BE185D");
    expect(resolveAccent({ accent: "#0F766E", allowPersonalAccent: false }, "#BE185D")).toBe("#0F766E");
    expect(resolveAccent({ accent: null, allowPersonalAccent: true }, null)).toBe(DEFAULT_ACCENT);
    expect(resolveAccent({ accent: "not a colour", allowPersonalAccent: true }, "nope")).toBe(DEFAULT_ACCENT);
  });

  it("emits no style sheet for the default accent and both modes for another", () => {
    expect(accentStyleSheet(DEFAULT_ACCENT)).toBe("");
    const css = accentStyleSheet("#0F766E");
    expect(css).toContain(`--accent:${deriveTokens("light", "#0F766E").accent};`);
    expect(css).toContain(`:root[data-theme="dark"]{--accent:${deriveTokens("dark", "#0F766E").accent};`);
    expect(css).toContain("prefers-color-scheme: dark");
  });
});

describe("app/globals.css", () => {
  const css = readFileSync("app/globals.css", "utf8");
  const block = (selector: string) => {
    const start = css.indexOf(`${selector} {`);
    expect(start, selector).toBeGreaterThan(-1);
    const body = css.slice(start, css.indexOf("}", start));
    return new Map([...body.matchAll(/--([\w-]+):\s*([^;]+);/g)].map((m) => [m[1]!, m[2]!.trim().toUpperCase()]));
  };

  it.each([
    [":root", "light"],
    [':root[data-theme="dark"]', "dark"],
    [':root:not([data-theme="light"])', "dark"],
  ] as const)("%s matches the %s tokens", (selector, mode) => {
    const vars = block(selector);
    const tokens = deriveTokens(mode);
    for (const [token, name] of Object.entries(CSS_NAMES)) {
      expect(vars.get(name), `${selector} --${name}`).toBe(tokens[token as keyof ThemeTokens]);
    }
  });

  it("exposes every token as a Tailwind colour", () => {
    for (const name of Object.values(CSS_NAMES)) expect(css).toContain(`--color-${name}: var(--${name});`);
  });
});
