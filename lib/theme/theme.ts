import { contrastRatio, mix } from "./color";

// The two scales. Every colour in the app is one of these or a tint/shade
// derived from them below. The base navy is fixed; app/globals.css holds the
// derived values as CSS custom properties, and a unit test keeps the two in step.
export const NAVY_900 = "#163260";
export const BONE_50 = "#FBF9F4";
export const BONE_100 = "#F5F1E8";
export const BONE_300 = "#DDD6C8";

export const MIN_CONTRAST = 4.5;

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

/** Every token, derived from a navy base over the bone scale. */
export function deriveTokens(navy: string = NAVY_900): ThemeTokens {
  // sidebar rail: navy at about 75% over bone, as a solid colour
  const rail = mix(navy, BONE_50, 0.76);
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
