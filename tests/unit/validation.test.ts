import { describe, expect, it } from "vitest";
import {
  ACCEPT_ATTRIBUTE,
  ALLOWED_MIME_TYPES,
  EXTENSION_TYPES,
  documentMetaInput,
  eventInput,
  mimeTypeFor,
  projectInput,
  sanitizeFileName,
  slugInput,
  tagsInput,
  uploadRequestInput,
} from "@/lib/validation";
import { originOf } from "@/lib/origin";

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

  it("checks upload metadata on its own, before the file is sent", () => {
    expect(documentMetaInput.safeParse({ name: "Budget.csv", tags: "budget, q4" }).success).toBe(true);
    expect(documentMetaInput.safeParse({ name: "Budget.csv", tags: "x".repeat(41) }).success).toBe(false);
    expect(documentMetaInput.safeParse({ name: "", tags: undefined }).success).toBe(false);
    expect(documentMetaInput.safeParse({ name: "a.pdf", projectId: "not-an-id" }).success).toBe(false);
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

describe("mimeTypeFor", () => {
  it("keeps an allowed type the browser reported", () => {
    expect(mimeTypeFor("report.pdf", "application/pdf")).toBe("application/pdf");
  });
  it("falls back to the extension when the browser reports nothing or an unlisted type", () => {
    expect(mimeTypeFor("notes.md", "")).toBe("text/markdown");
    expect(mimeTypeFor("Notes.MARKDOWN", "text/x-markdown")).toBe("text/markdown");
    expect(mimeTypeFor("minutes.odt", "")).toBe("application/vnd.oasis.opendocument.text");
    expect(mimeTypeFor("photo.JPG", "application/octet-stream")).toBe("image/jpeg");
  });
  it("maps every accepted extension to an allowed type", () => {
    for (const [ext, type] of Object.entries(EXTENSION_TYPES)) {
      expect(ALLOWED_MIME_TYPES).toContain(type);
      expect(ACCEPT_ATTRIBUTE.split(",")).toContain(`.${ext}`);
    }
    for (const type of ALLOWED_MIME_TYPES) expect(Object.values(EXTENSION_TYPES)).toContain(type);
  });
  it("leaves unknown files alone, so the server rejects them", () => {
    expect(mimeTypeFor("tool.exe", "application/x-msdownload")).toBe("application/x-msdownload");
    expect(mimeTypeFor("README", "")).toBe("");
  });
});

describe("originOf", () => {
  it("keeps only the origin of a configured site URL", () => {
    expect(originOf("app.example.org")).toBe("https://app.example.org");
    expect(originOf(" https://App.Example.org/some/path/ ")).toBe("https://app.example.org");
    expect(originOf("http://localhost:3000/")).toBe("http://localhost:3000");
  });
});
