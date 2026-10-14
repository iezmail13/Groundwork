import { contrastRatio, isHex, mix, normalizeHex, toHsl, withLightness } from "./color";

// Semantic colour tokens (D83–D85, D99). Navy #163260 is the text and sidebar
// colour; white/bone is the background; the accent (#0006BF unless an org or
// person picks another) is for buttons, links, active states and focus.
// Status and priority colours are fixed for everyone. Every token has a light
// and a dark value: app/globals.css holds them as custom properties, and a
// unit test keeps the two in step and checks contrast in both modes.

export const NAVY_900 = "#163260";
export const BONE_50 = "#FBF9F4";
export const BONE_100 = "#F5F1E8";
export const BONE_300 = "#DDD6C8";
export const WHITE = "#FFFFFF";
export const DEFAULT_ACCENT = "#0006BF";

/** Text must reach 4.5:1; chart marks, dots and icons 3:1 (D85). */
export const MIN_CONTRAST = 4.5;
export const MIN_MARK_CONTRAST = 3;

export type Mode = "light" | "dark";

export type AccentTokens = {
  accent: string; // buttons, links, active states, focus
  onAccent: string; // text on a filled accent
  accentTint: string; // selected rows, active nav, accent badges
};

export type StatusTokens = {
  good: string; // marks: dots, icons, bars
  goodInk: string; // text
  goodTint: string; // badge backgrounds
  warn: string;
  warnInk: string;
  warnTint: string;
  bad: string;
  badInk: string;
  badTint: string;
};

export type PriorityTokens = {
  prioCritical: string;
  prioHigh: string;
  prioMedium: string;
  prioLow: string;
  /** The dark outline and label colour that always goes with prio-medium (yellow). */
  prioMediumInk: string;
};

export type ThemeTokens = AccentTokens &
  StatusTokens &
  PriorityTokens & {
    canvas: string; // main work area
    panel: string; // panels and hover
    rule: string; // borders and rules
    ink: string; // body text
    inkMuted: string; // secondary text
    rail: string; // sidebar
    railInk: string;
    railInkMuted: string;
    railHover: string;
    railActive: string; // the current sidebar item
    railActiveInk: string;
    tint: string; // a quiet wash for drop targets and selected rows
    chart1: string; // neutral chart series: the accent and its tints and shades
    chart2: string;
    chart3: string;
    chart4: string;
    chart5: string;
  };

/** Status and priority colours, never themeable (D84). */
const FIXED: Record<Mode, StatusTokens & PriorityTokens> = {
  light: {
    good: "#16A34A",
    goodInk: "#147A3A",
    goodTint: "#E8F5EC",
    warn: "#D97706",
    warnInk: "#A35A04",
    warnTint: "#FBEFD9",
    bad: "#DC2626",
    badInk: "#B91C1C",
    badTint: "#FBE5E2",
    prioCritical: "#DC2626",
    prioHigh: "#EA580C",
    prioMedium: "#CA8A04",
    prioLow: "#2563EB",
    prioMediumInk: NAVY_900,
  },
  dark: {
    good: "#4ADE80",
    goodInk: "#4ADE80",
    goodTint: "#143A35",
    warn: "#FBBF24",
    warnInk: "#FBBF24",
    warnTint: "#3A3424",
    bad: "#F87171",
    badInk: "#F87171",
    badTint: "#3F2738",
    prioCritical: "#F87171",
    prioHigh: "#FB923C",
    prioMedium: "#FACC15",
    prioLow: "#60A5FA",
    prioMediumInk: "#F1EEE7",
  },
};

/** Surfaces and text for each mode. The dark canvas is a deep navy derived from #163260. */
function surfaces(mode: Mode) {
  if (mode === "light") {
    const inkMuted = mix(NAVY_900, BONE_50, 0.8);
    return {
      canvas: BONE_50,
      panel: BONE_100,
      rule: BONE_300,
      ink: NAVY_900,
      inkMuted,
      rail: NAVY_900,
      railInk: BONE_50,
      railInkMuted: mix(BONE_50, NAVY_900, 0.78),
      railHover: mix(BONE_50, NAVY_900, 0.12),
      railActive: BONE_50,
      railActiveInk: NAVY_900,
      tint: mix(NAVY_900, BONE_50, 0.06),
    };
  }
  const canvas = mix(NAVY_900, "#000000", 0.55);
  const rail = mix(NAVY_900, "#000000", 0.42);
  const ink = "#F1EEE7";
  return {
    canvas,
    panel: mix(NAVY_900, "#000000", 0.75),
    rule: mix(BONE_300, canvas, 0.2),
    ink,
    inkMuted: "#B6C1D8",
    rail,
    railInk: ink,
    railInkMuted: "#AEB9D0",
    railHover: mix(ink, rail, 0.08),
    railActive: mix(ink, rail, 0.16),
    railActiveInk: ink,
    tint: mix(BONE_50, canvas, 0.05),
  };
}

/**
 * The accent for one mode, lightness-adjusted until it passes (D85): 4.5:1 as
 * text on the canvas and its tint, with 4.5:1 text on it. Light mode darkens
 * an accent that's too light; dark mode lightens the choice, starting no
 * darker than 71% lightness (so #0006BF becomes about #6B70FF).
 */
export function deriveAccent(choice: string = DEFAULT_ACCENT, mode: Mode = "light"): AccentTokens {
  const base = isHex(choice) ? normalizeHex(choice) : DEFAULT_ACCENT;
  const { canvas, ink } = surfaces(mode);
  const passes = (accent: string) => {
    const tint = mix(accent, canvas, 0.12);
    const onAccent = pickOn(accent, mode);
    return (
      contrastRatio(accent, canvas) >= MIN_CONTRAST &&
      contrastRatio(accent, tint) >= MIN_CONTRAST &&
      contrastRatio(onAccent, accent) >= MIN_CONTRAST
    );
  };
  let l = toHsl(base).l;
  if (mode === "dark") l = Math.max(l, 0.71);
  let accent = withLightness(base, l);
  for (let i = 0; i < 100 && !passes(accent); i++) {
    l += mode === "light" ? -0.01 : 0.01;
    accent = withLightness(base, l);
  }
  // a hue that can't pass at any lightness falls back to the text colour
  if (!passes(accent)) accent = ink;
  return { accent, onAccent: pickOn(accent, mode), accentTint: mix(accent, canvas, 0.12) };
}

/** White on dark accents, the dark canvas on light ones: whichever reads better. */
function pickOn(accent: string, mode: Mode): string {
  const dark = surfaces("dark").canvas;
  const light = mode === "light" ? WHITE : surfaces("dark").ink;
  return contrastRatio(light, accent) >= contrastRatio(dark, accent) ? light : dark;
}

/** Five neutral chart series from the accent: full, two shades, two tints, all at 3:1 or more. */
function chartSeries(accent: string, mode: Mode): string[] {
  const { canvas, ink } = surfaces(mode);
  const raw = [accent, mix(accent, ink, 0.6), mix(accent, canvas, 0.7), mix(accent, ink, 0.3), mix(accent, canvas, 0.55)];
  return raw.map((c) => {
    let color = c;
    // keep each mark at 3:1 against the canvas
    for (let i = 0; i < 20 && contrastRatio(color, canvas) < MIN_MARK_CONTRAST; i++) color = mix(color, ink, 0.9);
    return color;
  });
}

/** Every token for one mode and accent choice. */
export function deriveTokens(mode: Mode = "light", accentChoice: string = DEFAULT_ACCENT): ThemeTokens {
  const accent = deriveAccent(accentChoice, mode);
  const [chart1, chart2, chart3, chart4, chart5] = chartSeries(accent.accent, mode) as [string, string, string, string, string];
  return { ...surfaces(mode), ...accent, ...FIXED[mode], chart1, chart2, chart3, chart4, chart5 };
}

/** The accent in force (D84): personal (if the org allows it) → org → #0006BF. */
export function resolveAccent(org: { accent: string | null; allowPersonalAccent: boolean }, personal: string | null): string {
  if (org.allowPersonalAccent && personal && isHex(personal)) return normalizeHex(personal);
  if (org.accent && isHex(org.accent)) return normalizeHex(org.accent);
  return DEFAULT_ACCENT;
}

/** The accent presets offered in Settings → Branding and Profile. */
export const ACCENT_PRESETS: { value: string; name: string }[] = [
  { value: "#0006BF", name: "Groundwork blue" },
  { value: "#163260", name: "Navy" },
  { value: "#0F766E", name: "Teal" },
  { value: "#15803D", name: "Forest" },
  { value: "#7C3AED", name: "Violet" },
  { value: "#BE185D", name: "Raspberry" },
  { value: "#B45309", name: "Copper" },
  { value: "#334155", name: "Slate" },
];

export type ContrastCheck = { pair: string; foreground: string; background: string; ratio: number; min: number; passes: boolean };

type Key = keyof ThemeTokens;
const TEXT: { pair: string; fg: Key; bg: Key }[] = [
  { pair: "Text on the work area", fg: "ink", bg: "canvas" },
  { pair: "Text on panels", fg: "ink", bg: "panel" },
  { pair: "Secondary text on the work area", fg: "inkMuted", bg: "canvas" },
  { pair: "Secondary text on panels", fg: "inkMuted", bg: "panel" },
  { pair: "Sidebar text", fg: "railInk", bg: "rail" },
  { pair: "Secondary sidebar text", fg: "railInkMuted", bg: "rail" },
  { pair: "Sidebar text on hover", fg: "railInk", bg: "railHover" },
  { pair: "Current sidebar item", fg: "railActiveInk", bg: "railActive" },
  { pair: "Links on the work area", fg: "accent", bg: "canvas" },
  { pair: "Links on panels", fg: "accent", bg: "panel" },
  { pair: "Accent text on its tint", fg: "accent", bg: "accentTint" },
  { pair: "Filled button text", fg: "onAccent", bg: "accent" },
  { pair: "Good text", fg: "goodInk", bg: "canvas" },
  { pair: "Good text on its tint", fg: "goodInk", bg: "goodTint" },
  { pair: "Warning text", fg: "warnInk", bg: "canvas" },
  { pair: "Warning text on its tint", fg: "warnInk", bg: "warnTint" },
  { pair: "Bad text", fg: "badInk", bg: "canvas" },
  { pair: "Bad text on its tint", fg: "badInk", bg: "badTint" },
  { pair: "Medium priority label", fg: "prioMediumInk", bg: "canvas" },
];
const MARKS: { pair: string; fg: Key; bg: Key }[] = [
  { pair: "Good mark", fg: "good", bg: "canvas" },
  { pair: "Warning mark", fg: "warn", bg: "canvas" },
  { pair: "Bad mark", fg: "bad", bg: "canvas" },
  { pair: "Critical priority flag", fg: "prioCritical", bg: "canvas" },
  { pair: "High priority flag", fg: "prioHigh", bg: "canvas" },
  // yellow always carries a dark outline, which is what has to stand out
  { pair: "Medium priority flag outline", fg: "prioMediumInk", bg: "canvas" },
  { pair: "Low priority flag", fg: "prioLow", bg: "canvas" },
  { pair: "Chart series 1", fg: "chart1", bg: "canvas" },
  { pair: "Chart series 2", fg: "chart2", bg: "canvas" },
  { pair: "Chart series 3", fg: "chart3", bg: "canvas" },
  { pair: "Chart series 4", fg: "chart4", bg: "canvas" },
  { pair: "Chart series 5", fg: "chart5", bg: "canvas" },
  { pair: "Focus ring", fg: "accent", bg: "canvas" },
  { pair: "Accent icon on the current sidebar item", fg: "accent", bg: "railActive" },
];

export function checkContrast(tokens: ThemeTokens): ContrastCheck[] {
  const run = (list: typeof TEXT, min: number) =>
    list.map(({ pair, fg, bg }) => {
      const ratio = contrastRatio(tokens[fg], tokens[bg]);
      return { pair, foreground: tokens[fg], background: tokens[bg], ratio, min, passes: ratio >= min };
    });
  return [...run(TEXT, MIN_CONTRAST), ...run(MARKS, MIN_MARK_CONTRAST)];
}

/** Custom-property names in app/globals.css, by token. */
export const CSS_NAMES: Record<Key, string> = {
  canvas: "canvas",
  panel: "panel",
  rule: "rule",
  ink: "ink",
  inkMuted: "ink-muted",
  rail: "rail",
  railInk: "rail-ink",
  railInkMuted: "rail-ink-muted",
  railHover: "rail-hover",
  railActive: "rail-active",
  railActiveInk: "rail-active-ink",
  tint: "tint",
  accent: "accent",
  onAccent: "on-accent",
  accentTint: "accent-tint",
  good: "good",
  goodInk: "good-ink",
  goodTint: "good-tint",
  warn: "warn",
  warnInk: "warn-ink",
  warnTint: "warn-tint",
  bad: "bad",
  badInk: "bad-ink",
  badTint: "bad-tint",
  prioCritical: "prio-critical",
  prioHigh: "prio-high",
  prioMedium: "prio-medium",
  prioLow: "prio-low",
  prioMediumInk: "prio-medium-ink",
  chart1: "chart-1",
  chart2: "chart-2",
  chart3: "chart-3",
  chart4: "chart-4",
  chart5: "chart-5",
};

/** The accent-dependent declarations for one mode, e.g. for an org's or person's accent. */
export function accentDeclarations(choice: string, mode: Mode): string {
  const t = deriveTokens(mode, choice);
  const keys: Key[] = ["accent", "onAccent", "accentTint", "chart1", "chart2", "chart3", "chart4", "chart5"];
  return keys.map((k) => `--${CSS_NAMES[k]}:${t[k]};`).join("");
}

/**
 * A style sheet that applies an accent other than the default in both modes.
 * The input is validated hex, so the output is safe to inline.
 */
export function accentStyleSheet(choice: string): string {
  if (normalizeHex(choice) === DEFAULT_ACCENT) return "";
  const light = accentDeclarations(choice, "light");
  const dark = accentDeclarations(choice, "dark");
  return `:root{${light}}:root[data-theme="dark"]{${dark}}@media (prefers-color-scheme: dark){:root:not([data-theme="light"]){${dark}}}`;
}
