import { DEFAULT_LABELS, LABEL_KEYS, type LabelForm, type LabelKey, type LabelMap } from "./defaults";

export type Translate = (key: LabelKey, form?: LabelForm) => string;

function clean(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

/**
 * Builds t(key, form). A label resolves in order: the organization's
 * override, then the preset's label, then the built-in default.
 */
export function createTranslator(presetLabels: LabelMap = {}, overrides: LabelMap = {}): Translate {
  return (key, form = "one") =>
    clean(overrides[key]?.[form]) ?? clean(presetLabels[key]?.[form]) ?? DEFAULT_LABELS[key][form];
}

/** Lower-case form for use inside sentences ("No tasks yet"). */
export function lower(label: string): string {
  return label.toLocaleLowerCase();
}

/** Narrows untrusted JSON (from the database) to a LabelMap. */
export function toLabelMap(value: unknown): LabelMap {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const source = value as Record<string, unknown>;
  const result: LabelMap = {};
  for (const key of LABEL_KEYS) {
    const entry = source[key];
    if (!entry || typeof entry !== "object") continue;
    const { one, other } = entry as Record<string, unknown>;
    const cleaned: { one?: string; other?: string } = {};
    if (clean(one)) cleaned.one = clean(one);
    if (clean(other)) cleaned.other = clean(other);
    if (cleaned.one || cleaned.other) result[key] = cleaned;
  }
  return result;
}

/** Resolve every key at once, e.g. to hand the whole table to the client. */
export function resolveAll(t: Translate): Record<LabelKey, { one: string; other: string }> {
  return Object.fromEntries(LABEL_KEYS.map((k) => [k, { one: t(k, "one"), other: t(k, "other") }])) as Record<
    LabelKey,
    { one: string; other: string }
  >;
}
