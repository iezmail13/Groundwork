import { describe, expect, it } from "vitest";
import { reportCsvRows, type Report } from "@/lib/report-model";
import { toCsv } from "@/lib/attendance-report";

const report: Report = {
  template: "progress",
  title: "Progress",
  scope: "All work, 2026-10-01 to 2026-10-17",
  from: "2026-10-01",
  to: "2026-10-17",
  generatedAt: "2026-10-17T12:30:00.000Z",
  organization: "Northside",
  sections: [
    { heading: "At a glance", stats: [{ label: "Open", value: "5" }] },
    { heading: "By priority", table: { caption: "c", head: ["Priority", "Open"], rows: [["High", 2]], empty: "None." } },
    { heading: "Overdue", table: { caption: "c", head: ["Title"], rows: [], empty: "Nothing overdue." } },
  ],
};

describe("report CSV", () => {
  it("lays out the title, figures and tables in order", () => {
    expect(reportCsvRows(report)).toEqual([
      ["Progress"],
      ["All work, 2026-10-01 to 2026-10-17"],
      ["Generated 2026-10-17 12:30 UTC"],
      [],
      ["At a glance"],
      ["Open", "5"],
      [],
      ["By priority"],
      ["Priority", "Open"],
      ["High", 2],
      [],
      ["Overdue"],
      ["Title"],
      ["Nothing overdue."],
      [],
    ]);
  });

  it("keeps spreadsheet formulas out of the cells", () => {
    const evil: Report = { ...report, sections: [{ heading: "x", table: { caption: "c", head: ["Title"], rows: [["=HYPERLINK(\"x\")"]], empty: "" } }] };
    expect(toCsv(reportCsvRows(evil))).not.toMatch(/(^|,)=HYPERLINK/m);
  });
});
