import { describe, expect, it } from "vitest";
import { eventInput, projectInput, sanitizeFileName, slugInput, tagsInput, uploadRequestInput } from "@/lib/validation";

const org = "6f1c1d8a-2b8e-4d55-9d77-0a3f7f4b8f10";

describe("server-side validation", () => {
  it("rejects a project end date before its start", () => {
    const r = projectInput.safeParse({ organizationId: org, name: "X", startDate: "2026-10-10", endDate: "2026-10-01" });
    expect(r.success).toBe(false);
  });

  it("requires times for timed events and orders them", () => {
    const base = { organizationId: org, title: "Standup", date: "2026-10-07", allDay: false, timeZone: "UTC" };
    expect(eventInput.safeParse(base).success).toBe(false);
    expect(eventInput.safeParse({ ...base, startTime: "10:00", endTime: "09:00" }).success).toBe(false);
    expect(eventInput.safeParse({ ...base, startTime: "09:00", endTime: "10:00" }).success).toBe(true);
    expect(eventInput.safeParse({ ...base, allDay: true }).success).toBe(true);
    expect(eventInput.safeParse({ ...base, allDay: true, timeZone: "Mars/Olympus" }).success).toBe(false);
  });

  it("normalises tags", () => {
    expect(tagsInput.parse("Budget, field trips,budget , ")).toEqual(["budget", "field-trips"]);
  });

  it("enforces the upload size limit and type allow-list", () => {
    const ok = { organizationId: org, fileName: "a.pdf", size: 1000, mimeType: "application/pdf" };
    expect(uploadRequestInput.safeParse(ok).success).toBe(true);
    expect(uploadRequestInput.safeParse({ ...ok, size: 26 * 1024 * 1024 }).success).toBe(false);
    expect(uploadRequestInput.safeParse({ ...ok, mimeType: "image/svg+xml" }).success).toBe(false);
    expect(uploadRequestInput.safeParse({ ...ok, mimeType: "application/x-msdownload" }).success).toBe(false);
  });

  it("sanitises storage file names", () => {
    expect(sanitizeFileName("Budget 2026 (final).pdf")).toBe("Budget-2026-final.pdf");
    expect(sanitizeFileName("../../etc/passwd")).toBe("etc-passwd");
    expect(sanitizeFileName("Résumé.docx")).toBe("Resume.docx");
  });

  it("validates slugs", () => {
    expect(slugInput.safeParse("northside").success).toBe(true);
    expect(slugInput.safeParse("-bad").success).toBe(false);
    expect(slugInput.safeParse("Upper").success).toBe(false);
    expect(slugInput.safeParse("login").success).toBe(false);
  });
});
