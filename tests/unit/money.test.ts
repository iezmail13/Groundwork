import { describe, expect, it } from "vitest";
import { centsToInput, formatMoney, formatShare, parseCents } from "@/lib/money";

describe("money", () => {
  it("reads amounts the way people type them, in exact cents", () => {
    expect(parseCents("10,000")).toBe(1000000);
    expect(parseCents("$1,234.5")).toBe(123450);
    expect(parseCents(" 0.07 ")).toBe(7);
    expect(parseCents("19.99")).toBe(1999);
  });

  it("refuses things that aren't amounts", () => {
    for (const bad of ["", "abc", "-5", "1.234", "1e5", "12.3.4"]) expect(parseCents(bad)).toBeNull();
  });

  it("formats and round-trips", () => {
    expect(formatMoney(1000000, "CAD")).toBe("$10,000.00");
    expect(formatMoney(1000000, "CAD", true)).toBe("$10,000");
    expect(formatMoney(5000, "EUR", true)).toBe("€50");
    expect(formatMoney(123450, "USD", true)).toBe("$1,234.50");
    expect(centsToInput(123450)).toBe("1234.50");
    expect(centsToInput(1000000)).toBe("10000");
  });

  it("shows shares without hiding small ones", () => {
    expect(formatShare(250000, 1000000)).toBe("25%");
    expect(formatShare(1, 1000000)).toBe("<1%");
    expect(formatShare(0, 0)).toBe("—");
  });
});
