// Small colour toolkit: hex parsing, sRGB mixing, WCAG luminance and contrast.

export type Rgb = { r: number; g: number; b: number };

const HEX = /^#?([0-9a-f]{6})$/i;

export function isHex(value: string): boolean {
  return HEX.test(value.trim());
}

export function parseHex(value: string): Rgb {
  const match = HEX.exec(value.trim());
  if (!match?.[1]) throw new Error(`Not a 6-digit hex colour: ${value}`);
  const n = parseInt(match[1], 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}

export function toHex({ r, g, b }: Rgb): string {
  const h = (n: number) => Math.round(Math.min(255, Math.max(0, n))).toString(16).padStart(2, "0");
  return `#${h(r)}${h(g)}${h(b)}`.toUpperCase();
}

export function normalizeHex(value: string): string {
  return toHex(parseHex(value));
}

/** `weight` of `a` laid over `b` (0..1), as a solid colour. */
export function mix(a: string, b: string, weight: number): string {
  const x = parseHex(a);
  const y = parseHex(b);
  return toHex({
    r: x.r * weight + y.r * (1 - weight),
    g: x.g * weight + y.g * (1 - weight),
    b: x.b * weight + y.b * (1 - weight),
  });
}

function channel(c: number): number {
  const s = c / 255;
  return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
}

export function luminance(hex: string): number {
  const { r, g, b } = parseHex(hex);
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

/** WCAG 2 contrast ratio, 1..21. */
export function contrastRatio(a: string, b: string): number {
  const la = luminance(a);
  const lb = luminance(b);
  const [hi, lo] = la > lb ? [la, lb] : [lb, la];
  return (hi + 0.05) / (lo + 0.05);
}

export type Hsl = { h: number; s: number; l: number };

/** Hue in degrees, saturation and lightness 0..1. */
export function toHsl(hex: string): Hsl {
  const { r, g, b } = parseHex(hex);
  const [x, y, z] = [r / 255, g / 255, b / 255];
  const max = Math.max(x, y, z);
  const min = Math.min(x, y, z);
  const l = (max + min) / 2;
  if (max === min) return { h: 0, s: 0, l };
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  const h = max === x ? ((y - z) / d + (y < z ? 6 : 0)) * 60 : max === y ? ((z - x) / d + 2) * 60 : ((x - y) / d + 4) * 60;
  return { h, s, l };
}

export function fromHsl({ h, s, l }: Hsl): string {
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const hp = (((h % 360) + 360) % 360) / 60;
  const x = c * (1 - Math.abs((hp % 2) - 1));
  const [r, g, b] =
    hp < 1 ? [c, x, 0] : hp < 2 ? [x, c, 0] : hp < 3 ? [0, c, x] : hp < 4 ? [0, x, c] : hp < 5 ? [x, 0, c] : [c, 0, x];
  const m = l - c / 2;
  return toHex({ r: (r + m) * 255, g: (g + m) * 255, b: (b + m) * 255 });
}

/** The same hue and saturation at another lightness (0..1). */
export function withLightness(hex: string, l: number): string {
  return fromHsl({ ...toHsl(hex), l: Math.min(1, Math.max(0, l)) });
}
