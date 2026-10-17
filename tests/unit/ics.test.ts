import { describe, expect, it } from "vitest";
import { buildCalendar, escapeText, foldLine, utcStamp, type FeedItem } from "@/lib/ics";

const work: FeedItem = {
  item_type: "task",
  item_id: "11111111-1111-4111-8111-111111111111",
  title: "Print the forms",
  starts_at: null,
  ends_at: null,
  all_day: true,
  due_date: "2026-10-20",
  updated_at: "2026-10-14T12:00:00.000Z",
};

const session: FeedItem = {
  item_type: "event",
  item_id: "22222222-2222-4222-8222-222222222222",
  title: "Homework Club, week 3",
  starts_at: "2026-10-21T22:00:00+00:00",
  ends_at: "2026-10-21T23:30:00+00:00",
  all_day: false,
  due_date: null,
  updated_at: "2026-10-14T12:00:00+00:00",
};

describe("escapeText", () => {
  it("escapes the characters iCalendar reserves", () => {
    expect(escapeText("a\\b;c,d\ne")).toBe("a\\\\b\\;c\\,d\\ne");
  });
});

describe("foldLine", () => {
  it("leaves short lines alone", () => {
    expect(foldLine("SUMMARY:Short")).toBe("SUMMARY:Short");
  });

  it("folds long lines at 75 octets, continuing with a space", () => {
    const folded = foldLine(`SUMMARY:${"x".repeat(200)}`);
    const lines = folded.split("\r\n");
    expect(lines.length).toBeGreaterThan(1);
    for (const line of lines) expect(new TextEncoder().encode(line).length).toBeLessThanOrEqual(75);
    expect(lines.slice(1).every((l) => l.startsWith(" "))).toBe(true);
    expect(lines.map((l, i) => (i === 0 ? l : l.slice(1))).join("")).toBe(`SUMMARY:${"x".repeat(200)}`);
  });

  it("never splits a multi-byte character", () => {
    const folded = foldLine(`SUMMARY:${"é".repeat(60)}`);
    const unfolded = folded
      .split("\r\n")
      .map((l, i) => (i === 0 ? l : l.slice(1)))
      .join("");
    expect(unfolded).toBe(`SUMMARY:${"é".repeat(60)}`);
  });
});

describe("utcStamp", () => {
  it("formats a UTC date-time", () => {
    expect(utcStamp("2026-10-21T22:05:09.000Z")).toBe("20261021T220509Z");
  });
});

describe("buildCalendar", () => {
  const text = buildCalendar([work, session], "groundwork.example");

  it("is a calendar with CRLF line endings", () => {
    expect(text.startsWith("BEGIN:VCALENDAR\r\nVERSION:2.0\r\n")).toBe(true);
    expect(text.endsWith("END:VCALENDAR\r\n")).toBe(true);
    expect(text.replace(/\r\n/g, "")).not.toMatch(/[\r\n]/);
  });

  it("shows work as an all-day entry on its due day", () => {
    expect(text).toContain("UID:task-11111111-1111-4111-8111-111111111111@groundwork.example");
    expect(text).toContain("DTSTART;VALUE=DATE:20261020\r\nDTEND;VALUE=DATE:20261021");
  });

  it("shows calendar items at their times, in UTC", () => {
    expect(text).toContain("DTSTART:20261021T220000Z\r\nDTEND:20261021T233000Z");
    expect(text).toContain("SUMMARY:Homework Club\\, week 3");
  });

  it("holds titles and dates only", () => {
    expect(text).not.toMatch(/DESCRIPTION|LOCATION|ATTENDEE|ORGANIZER|URL:/);
  });

  it("shows all-day items over the days they cover", () => {
    const day = buildCalendar(
      [{ ...session, all_day: true, starts_at: "2026-10-21T00:00:00+00:00", ends_at: "2026-10-23T00:00:00+00:00" }],
      "h",
    );
    expect(day).toContain("DTSTART;VALUE=DATE:20261021\r\nDTEND;VALUE=DATE:20261023");
  });
});
