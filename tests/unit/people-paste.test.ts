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

  it("skips blank lines, including Windows line ends", () => {
    expect(parsePastedPeople("\r\nDee\r\n\r\n  \n")).toHaveLength(1);
  });
});
