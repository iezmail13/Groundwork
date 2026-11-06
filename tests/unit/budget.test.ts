import { describe, expect, it } from "vitest";
import { budgetStatus } from "@/lib/budget";

const today = "2026-10-17";
const base = { totalCents: 100_000, spendBy: null as string | null, today };

describe("budget against actual", () => {
  it("is on pace with room left and no close deadline", () => {
    expect(budgetStatus({ ...base, spentCents: 40_000 })).toBe("on_pace");
    expect(budgetStatus({ ...base, spentCents: 40_000, spendBy: "2027-03-01" })).toBe("on_pace");
  });

  it("is over budget once spending passes the total", () => {
    expect(budgetStatus({ ...base, spentCents: 100_001 })).toBe("over");
    expect(budgetStatus({ ...base, spentCents: 120_000, spendBy: "2026-10-20" })).toBe("over");
  });

  it("is near the limit at 85% spent", () => {
    expect(budgetStatus({ ...base, spentCents: 84_999 })).toBe("on_pace");
    expect(budgetStatus({ ...base, spentCents: 85_000 })).toBe("near_limit");
    expect(budgetStatus({ ...base, spentCents: 100_000 })).toBe("near_limit");
  });

  it("is at risk when time-limited money is close to its deadline with much left", () => {
    expect(budgetStatus({ ...base, spentCents: 50_000, spendBy: "2026-11-10" })).toBe("at_risk");
    // an expired deadline with money left is at risk too
    expect(budgetStatus({ ...base, spentCents: 10_000, spendBy: "2026-10-01" })).toBe("at_risk");
  });

  it("only flags the deadline when a little is left", () => {
    expect(budgetStatus({ ...base, spentCents: 80_000, spendBy: "2026-11-10" })).toBe("deadline_soon");
    expect(budgetStatus({ ...base, spentCents: 90_000, spendBy: "2026-11-10" })).toBe("near_limit");
    expect(budgetStatus({ ...base, spentCents: 100_000, spendBy: "2026-11-10" })).toBe("near_limit");
    // more than 30 days out isn't close
    expect(budgetStatus({ ...base, spentCents: 10_000, spendBy: "2026-11-17" })).toBe("on_pace");
  });
});
