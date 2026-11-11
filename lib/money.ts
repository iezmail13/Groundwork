import { LOCALE } from "@/lib/dates";

export const CURRENCIES = ["CAD", "USD", "EUR", "GBP"] as const;
export type Currency = (typeof CURRENCIES)[number];

/** Whole cents for "10,000", "$1,234.5" or "99.99"; null if it isn't an amount. */
export function parseCents(input: string): number | null {
  const text = input.trim().replace(/^[$€£]\s*/, "").replace(/[,\s]/g, "");
  if (!/^\d{1,12}(\.\d{1,2})?$/.test(text)) return null;
  const [whole, fraction = ""] = text.split(".");
  return Number(whole) * 100 + Number(fraction.padEnd(2, "0"));
}

/** "$10,000.00" in the fund's currency; whole amounts drop the cents when `compact`. */
export function formatMoney(cents: number, currency: string, compact = false): string {
  const whole = cents % 100 === 0;
  return new Intl.NumberFormat(LOCALE, {
    style: "currency",
    currency,
    // "$" rather than "CA$": the fund names its currency once, beside its total
    currencyDisplay: "narrowSymbol",
    minimumFractionDigits: compact && whole ? 0 : 2,
    maximumFractionDigits: compact && whole ? 0 : 2,
  }).format(cents / 100);
}

/** The amount as typed into a form field: "10000" or "10000.50". */
export function centsToInput(cents: number): string {
  return cents % 100 === 0 ? String(cents / 100) : (cents / 100).toFixed(2);
}

/** A share of a total, as a whole-number percentage ("33%"), never rounding a non-zero share to 0. */
export function formatShare(part: number, total: number): string {
  if (total <= 0) return "—";
  const pct = (part / total) * 100;
  if (pct > 0 && pct < 1) return "<1%";
  return `${Math.round(pct)}%`;
}
