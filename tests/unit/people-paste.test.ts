import { describe, expect, it } from "vitest";
import { parsePastedPeople } from "@/lib/people-paste";

describe("pasting a list of people", () => {
  it("reads one person per line, with commas", () => {
    expect(parsePastedPeople("Ana Lima, ana@example.org, 555-0101\nBen Okafor")).toEqual([
      { name: "Ana Lima", email: "ana@example.org", phone: "555-0101", guardianName: "", emergencyContact: "" },
      { name: "Ben Okafor", email: "", phone: "", guardianName: "", emergencyContact: "" },
    ]);
  });

  it("reads tabs from a spreadsheet, keeping commas inside cells", () => {
    expect(parsePastedPeople("Cy Tran\t\t\tLinh Tran\tLinh, 555-0199")).toEqual([
      { name: "Cy Tran", email: "", phone: "", guardianName: "Linh Tran", emergencyContact: "Linh, 555-0199" },
    ]);
  });

  it("keeps commas inside quoted cells, and doubled quotes", () => {
    expect(parsePastedPeople('"Doe, Jane",jane@x.org,555-1234,"Smith, Ann","Ann ""Nan"" Smith, 555-9999"')).toEqual([
      { name: "Doe, Jane", email: "jane@x.org", phone: "555-1234", guardianName: "Smith, Ann", emergencyContact: 'Ann "Nan" Smith, 555-9999' },
    ]);
  });

  it("skips a header row naming the columns", () => {
    expect(parsePastedPeople("Name,Email,Phone\nAna Lima,ana@example.org")).toEqual([
      { name: "Ana Lima", email: "ana@example.org", phone: "", guardianName: "", emergencyContact: "" },
    ]);
  });

  it("skips blank lines, including Windows line ends", () => {
    expect(parsePastedPeople("\r\nDee\r\n\r\n  \n")).toHaveLength(1);
  });
});
