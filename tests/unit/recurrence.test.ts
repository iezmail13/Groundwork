import { describe, expect, it } from "vitest";
import { MAX_OCCURRENCES, weekdayOf, weeklyDates } from "@/lib/recurrence";

describe("weekly repeats", () => {
  it("reads weekdays from calendar dates", () => {
    expect(weekdayOf("2026-11-06")).toBe(5); // a Friday
    expect(weekdayOf("2026-11-08")).toBe(0); // a Sunday
  });

  it("every Friday for 5 weeks is 5 Fridays", () => {
    expect(weeklyDates("2026-11-06", [5], 5)).toEqual(["2026-11-06", "2026-11-13", "2026-11-20", "2026-11-27", "2026-12-04"]);
  });

  it("starts at the first chosen weekday on or after the start date", () => {
    // a Wednesday start, Fridays only: the first is two days later
    expect(weeklyDates("2026-11-04", [5], 2)).toEqual(["2026-11-06", "2026-11-13"]);
  });

  it("takes several weekdays in date order, across a month end", () => {
    expect(weeklyDates("2026-11-30", [1, 3], 2)).toEqual(["2026-11-30", "2026-12-02", "2026-12-07", "2026-12-09"]);
  });

  it("ignores nonsense weekdays and caps the count", () => {
    expect(weeklyDates("2026-11-06", [9, -1, 2.5], 4)).toEqual([]);
    expect(weeklyDates("2026-01-01", [0, 1, 2, 3, 4, 5, 6], 52)).toHaveLength(MAX_OCCURRENCES);
  });
});
