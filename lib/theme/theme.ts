import { contrastRatio, isHex, mix, normalizeHex, toHsl } from "./color";

// The two scales. Every colour in the app is one of these or a tint/shade
// derived from them below.
export const NAVY_900 = "#1F2D4D";
export const RAIL_DEFAULT = "#555E74";
export const BONE_50 = "#FBF9F4";
export const BONE_100 = "#F5F1E8";
export const BONE_300 = "#DDD6C8";
const BLACK = "#000000";

export const MIN_CONTRAST = 4.5;

export type ThemeMode = "light" | "dark";
export type ThemeSettings = { navy: string; mode: ThemeMode };

export const DEFAULT_THEME: ThemeSettings = { navy: NAVY_900, mode: "light" };

export type ThemeTokens = {
  canvas: string; // main work area
  panel: string; // panels, hover, logo badge
  rule: string; // borders and rules
  ink: string; // body text
  inkMuted: string; // secondary text
  rail: string; // sidebar (solid)
  railInk: string;
  railInkMuted: string;
  railHover: string;
  primary: string; // filled buttons and badges
  onPrimary: string;
  activeBg: string; // active nav item
  activeInk: string;
  tint: string; // subtle navy wash for selected rows, drop targets
};

/** Sidebar rail: navy at about 75% over bone, as a solid colour. */
export function deriveRail(navy: string): string {
  const n = normalizeHex(navy);
  return n === NAVY_900 ? RAIL_DEFAULT : mix(n, BONE_50, 0.76);
}

export function deriveTokens(settings: ThemeSettings): ThemeTokens {
  const navy = normalizeHex(settings.navy);
  if (settings.mode === "dark") {
    // Dark mode inverts the same two scales: bone text on deep navy.
    const canvas = mix(navy, BLACK, 0.5);
    const panel = mix(navy, BLACK, 0.72);
    const rail = navy;
    return {
      canvas,
      panel,
      rule: mix(BONE_300, canvas, 0.24),
      ink: BONE_50,
      inkMuted: mix(BONE_50, canvas, 0.74),
      rail,
      railInk: BONE_50,
      railInkMuted: mix(BONE_50, rail, 0.8),
      railHover: mix(BONE_50, rail, 0.1),
      primary: BONE_100,
      onPrimary: canvas,
      activeBg: BONE_100,
      activeInk: canvas,
      tint: mix(BONE_50, canvas, 0.08),
    };
  }
  const rail = deriveRail(navy);
  return {
    canvas: BONE_50,
    panel: BONE_100,
    rule: BONE_300,
    ink: navy,
    inkMuted: mix(navy, BONE_50, 0.8),
    rail,
    railInk: BONE_50,
    railInkMuted: mix(BONE_50, rail, 0.9),
    // hover darkens the rail toward navy, which keeps bone text legible
    railHover: mix(navy, rail, 0.35),
    primary: navy,
    onPrimary: BONE_50,
    activeBg: BONE_100,
    activeInk: navy,
    tint: mix(navy, BONE_50, 0.06),
  };
}

export type ContrastCheck = { pair: string; foreground: string; background: string; ratio: number; passes: boolean };

const PAIRS: { pair: string; fg: keyof ThemeTokens; bg: keyof ThemeTokens }[] = [
  { pair: "Text on the work area", fg: "ink", bg: "canvas" },
  { pair: "Text on panels", fg: "ink", bg: "panel" },
  { pair: "Secondary text on the work area", fg: "inkMuted", bg: "canvas" },
  { pair: "Secondary text on panels", fg: "inkMuted", bg: "panel" },
  { pair: "Sidebar text", fg: "railInk", bg: "rail" },
  { pair: "Secondary sidebar text", fg: "railInkMuted", bg: "rail" },
  { pair: "Sidebar text on hover", fg: "railInk", bg: "railHover" },
  { pair: "Filled button text", fg: "onPrimary", bg: "primary" },
  { pair: "Active sidebar item", fg: "activeInk", bg: "activeBg" },
];

export function checkContrast(tokens: ThemeTokens): ContrastCheck[] {
  return PAIRS.map(({ pair, fg, bg }) => {
    const ratio = contrastRatio(tokens[fg], tokens[bg]);
    return { pair, foreground: tokens[fg], background: tokens[bg], ratio, passes: ratio >= MIN_CONTRAST };
  });
}

/**
 * The base colour must stay in the navy family (blue hue, not neon) so the
 * two-scale palette holds whatever an admin picks.
 */
export function isNavyFamily(hex: string): boolean {
  const { h, s, l } = toHsl(hex);
  return h >= 195 && h <= 250 && s <= 0.7 && l <= 0.5;
}

export type ThemeValidation =
  | { ok: true; tokens: ThemeTokens; checks: ContrastCheck[] }
  | { ok: false; reason: string; checks: ContrastCheck[] };

export function validateTheme(settings: ThemeSettings): ThemeValidation {
  if (!isHex(settings.navy)) return { ok: false, reason: "Enter a colour as six hex digits, like #1F2D4D.", checks: [] };
  if (!isNavyFamily(settings.navy)) {
    return {
      ok: false,
      reason: "Pick a navy: a blue hue that is darker than mid-tone and not too saturated.",
      checks: [],
    };
  }
  const tokens = deriveTokens(settings);
  const checks = checkContrast(tokens);
  const failing = checks.filter((c) => !c.passes);
  if (failing.length > 0) {
    return {
      ok: false,
      reason: `Text contrast would drop below ${MIN_CONTRAST}:1 for: ${failing
        .map((f) => `${f.pair.toLowerCase()} (${f.ratio.toFixed(2)}:1)`)
        .join(", ")}.`,
      checks,
    };
  }
  return { ok: true, tokens, checks };
}

/** Narrows organizations.theme (untrusted JSON) to valid settings. */
export function readTheme(value: unknown): ThemeSettings {
  if (!value || typeof value !== "object") return DEFAULT_THEME;
  const v = value as Record<string, unknown>;
  const navy = typeof v.navy === "string" && isHex(v.navy) ? normalizeHex(v.navy) : DEFAULT_THEME.navy;
  const mode: ThemeMode = v.mode === "dark" ? "dark" : "light";
  const settings = { navy, mode };
  // Never render a stored theme that fails the contrast gate.
  return validateTheme(settings).ok ? settings : { ...DEFAULT_THEME, mode };
}

/** CSS custom properties for a theme, applied on the app shell. */
export function themeStyle(tokens: ThemeTokens): Record<string, string> {
  return {
    "--canvas": tokens.canvas,
    "--panel": tokens.panel,
    "--rule": tokens.rule,
    "--ink": tokens.ink,
    "--ink-muted": tokens.inkMuted,
    "--rail": tokens.rail,
    "--rail-ink": tokens.railInk,
    "--rail-ink-muted": tokens.railInkMuted,
    "--rail-hover": tokens.railHover,
    "--primary": tokens.primary,
    "--on-primary": tokens.onPrimary,
    "--active-bg": tokens.activeBg,
    "--active-ink": tokens.activeInk,
    "--tint": tokens.tint,
  };
}
