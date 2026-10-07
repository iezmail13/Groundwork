import { describe, expect, it } from "vitest";
import {
  addDays,
  dateInZone,
  dueState,
  eventEndDate,
  eventStartDate,
  formatRelativeDate,
  isIsoDate,
  monthGrid,
  shiftMonth,
  timeInZone,
  zonedTimeToUtc,
} from "@/lib/dates";

describe("time zones", () => {
  it("converts wall-clock time in a zone to UTC", () => {
    expect(zonedTimeToUtc("2026-10-07", "09:30", "America/Toronto").toISOString()).toBe("2026-10-07T13:30:00.000Z");
    expect(zonedTimeToUtc("2026-01-15", "09:30", "America/Toronto").toISOString()).toBe("2026-01-15T14:30:00.000Z");
    expect(zonedTimeToUtc("2026-10-07", "09:30", "UTC").toISOString()).toBe("2026-10-07T09:30:00.000Z");
    expect(zonedTimeToUtc("2026-10-07", "09:30", "Asia/Kolkata").toISOString()).toBe("2026-10-07T04:00:00.000Z");
  });

  it("round-trips through dateInZone and timeInZone", () => {
    const instant = zonedTimeToUtc("2026-03-08", "15:45", "America/Vancouver");
    expect(dateInZone(instant, "America/Vancouver")).toBe("2026-03-08");
    expect(timeInZone(instant, "America/Vancouver")).toBe("15:45");
  });

  it("puts all-day events on their UTC date for every viewer", () => {
    const start = "2026-10-07T00:00:00.000Z";
    const end = "2026-10-08T00:00:00.000Z";
    expect(eventStartDate(start, true, "America/Vancouver")).toBe("2026-10-07");
    expect(eventEndDate(end, true, "Pacific/Auckland")).toBe("2026-10-07");
  });
});

describe("calendar dates", () => {
  it("validates ISO dates", () => {
    expect(isIsoDate("2026-02-28")).toBe(true);
    expect(isIsoDate("2026-02-30")).toBe(false);
    expect(isIsoDate("26-2-3")).toBe(false);
  });

  it("adds days across month and year boundaries", () => {
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
    expect(addDays("2026-03-01", -1)).toBe("2026-02-28");
  });

  it("shifts months", () => {
    expect(shiftMonth("2026-01", -1)).toBe("2025-12");
    expect(shiftMonth("2026-12", 1)).toBe("2027-01");
  });

  it("builds a Monday-first month grid that covers the whole month", () => {
    const weeks = monthGrid("2026-10");
    expect(weeks[0]?.[0]).toBe("2026-09-28"); // Oct 1 2026 is a Thursday
    expect(weeks.every((w) => w.length === 7)).toBe(true);
    expect(weeks.flat()).toContain("2026-10-31");
    expect(weeks.at(-1)?.at(-1)).toBe("2026-11-01");
  });

  it("labels nearby dates relatively", () => {
    expect(formatRelativeDate("2026-10-07", "2026-10-07")).toBe("Today");
    expect(formatRelativeDate("2026-10-08", "2026-10-07")).toBe("Tomorrow");
    expect(formatRelativeDate("2026-10-06", "2026-10-07")).toBe("Yesterday");
    expect(formatRelativeDate("2026-10-20", "2026-10-07")).toBe("Oct 20");
  });
});

describe("due state", () => {
  const today = "2026-10-07";
  it("classifies overdue, due soon and later", () => {
    expect(dueState("2026-10-06", "todo", today)).toBe("overdue");
    expect(dueState("2026-10-07", "in_progress", today)).toBe("due_soon");
    expect(dueState("2026-10-09", "todo", today)).toBe("due_soon");
    expect(dueState("2026-10-10", "todo", today)).toBe("due_later");
  });
  it("never flags done or undated tasks", () => {
    expect(dueState("2026-10-01", "done", today)).toBe("none");
    expect(dueState(null, "todo", today)).toBe("none");
  });
});
