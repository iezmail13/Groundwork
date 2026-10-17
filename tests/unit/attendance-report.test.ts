import { describe, expect, it } from "vitest";
import { attendanceRate, csvField, formatRate, groupMarks, toCsv, type MarkStatus } from "@/lib/attendance-report";

const marks: { who: string | null; status: MarkStatus }[] = [
  { who: "a", status: "present" },
  { who: "a", status: "late" },
  { who: "a", status: "absent" },
  { who: "a", status: "excused" },
  { who: "b", status: "absent" },
  { who: null, status: "present" },
];

describe("attendance report", () => {
  it("counts present and late as attending and leaves excused out", () => {
    const [a] = groupMarks(marks, (m) => m.who, (k) => k.toUpperCase(), "Removed");
    expect(a).toMatchObject({ key: "a", name: "A", tally: { present: 1, late: 1, absent: 1, excused: 1, total: 4 } });
    expect(a!.rate).toBeCloseTo(2 / 3);
    expect(formatRate(a!.rate)).toBe("67%");
  });

  it("has no rate when nothing counts, and groups deleted participants last", () => {
    const rows = groupMarks(marks, (m) => m.who, (k) => k.toUpperCase(), "Removed");
    expect(rows.map((r) => r.name)).toEqual(["A", "B", "Removed"]);
    expect(attendanceRate({ present: 0, late: 0, absent: 0, excused: 3, total: 3 })).toBeNull();
    expect(formatRate(null)).toBe("—");
  });

  it("writes CSV that spreadsheets can't mistake for formulas", () => {
    expect(csvField('Sam "Jr", 7')).toBe('"Sam ""Jr"", 7"');
    expect(csvField("=HYPERLINK(1)")).toBe("'=HYPERLINK(1)");
    expect(csvField(null)).toBe("");
    expect(toCsv([["Name", "Rate"], ["Pat", "80%"]])).toBe("Name,Rate\r\nPat,80%\r\n");
  });
});
