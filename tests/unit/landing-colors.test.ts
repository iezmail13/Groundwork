import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { contrastRatio } from "@/lib/theme/color";

// The landing and sign-in pages' own colours (D117) live in app/globals.css,
// one block per colour scheme. Every pair of text and its background must
// reach 4.5:1, and the grid's glow and other marks 3:1, in both schemes.
const css = readFileSync("app/globals.css", "utf8");
const start = css.indexOf(":root:has(.landing),");
const lightBlock = css.slice(start, css.indexOf("}", start));
const darkStart = css.indexOf(":root:has(.landing),", start + 10);
const darkBlock = css.slice(darkStart, css.indexOf("}", darkStart));

function tokens(block: string): Record<string, string> {
  return Object.fromEntries([...block.matchAll(/--([\w-]+):\s*(#[0-9A-Fa-f]{6})/g)].map((m) => [m[1]!, m[2]!]));
}

describe.each([
  ["light", tokens(lightBlock)],
  ["dark", tokens(darkBlock)],
])("landing colours: %s", (_mode, t) => {
  it("has every token", () => {
    for (const key of ["canvas", "panel", "ink", "ink-muted", "accent", "on-accent", "landing-accent-hover", "landing-highlight", "landing-cell", "landing-glow"]) {
      expect(t[key], key).toMatch(/^#/);
    }
  });
  it("keeps text at 4.5:1 or more", () => {
    for (const ground of ["canvas", "panel"]) {
      expect(contrastRatio(t.ink!, t[ground]!)).toBeGreaterThanOrEqual(4.5);
      expect(contrastRatio(t["ink-muted"]!, t[ground]!)).toBeGreaterThanOrEqual(4.5);
      expect(contrastRatio(t["landing-highlight"]!, t[ground]!)).toBeGreaterThanOrEqual(4.5);
      expect(contrastRatio(t.accent!, t[ground]!)).toBeGreaterThanOrEqual(4.5);
    }
    expect(contrastRatio(t["on-accent"]!, t.accent!)).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio(t["on-accent"]!, t["landing-accent-hover"]!)).toBeGreaterThanOrEqual(4.5);
  });
  it("keeps marks at 3:1 or more", () => {
    expect(contrastRatio(t["landing-glow"]!, t.canvas!)).toBeGreaterThanOrEqual(3);
  });
});
