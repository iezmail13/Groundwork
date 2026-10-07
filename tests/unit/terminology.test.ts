import { describe, expect, it } from "vitest";
import { createTranslator, resolveAll, toLabelMap } from "@/lib/terminology/t";
import { DEFAULT_LABELS, LABEL_KEYS } from "@/lib/terminology/defaults";

const nonprofit = {
  project: { one: "Program", other: "Programs" },
  event: { one: "Session", other: "Sessions" },
};

describe("t(key, form)", () => {
  it("falls back to the built-in default", () => {
    const t = createTranslator();
    expect(t("project")).toBe("Project");
    expect(t("project", "other")).toBe("Projects");
    expect(t("status.in_progress")).toBe("In progress");
  });

  it("prefers the preset label over the default", () => {
    const t = createTranslator(nonprofit);
    expect(t("project")).toBe("Program");
    expect(t("event", "other")).toBe("Sessions");
    expect(t("task")).toBe("Task");
  });

  it("prefers the organization override over the preset", () => {
    const t = createTranslator(nonprofit, { project: { one: "Initiative", other: "Initiatives" } });
    expect(t("project")).toBe("Initiative");
    expect(t("project", "other")).toBe("Initiatives");
    expect(t("event")).toBe("Session");
  });

  it("resolves each form independently", () => {
    const t = createTranslator(nonprofit, { project: { other: "Our programs" } });
    expect(t("project", "one")).toBe("Program");
    expect(t("project", "other")).toBe("Our programs");
  });

  it("ignores blank overrides", () => {
    const t = createTranslator(nonprofit, { project: { one: "   ", other: "" } });
    expect(t("project")).toBe("Program");
    expect(t("project", "other")).toBe("Programs");
  });

  it("defaults to the singular form", () => {
    expect(createTranslator()("member")).toBe("Member");
  });

  it("switching presets relabels with no code change", () => {
    const tutoring = { project: { one: "Subject", other: "Subjects" }, event: { one: "Lesson", other: "Lessons" } };
    const business = { event: { one: "Meeting", other: "Meetings" } };
    expect(createTranslator(tutoring)("project", "other")).toBe("Subjects");
    expect(createTranslator(business)("event")).toBe("Meeting");
  });
});

describe("toLabelMap", () => {
  it("keeps only known keys and non-empty strings", () => {
    const map = toLabelMap({
      project: { one: " Program ", other: 42 },
      bogus: { one: "x" },
      task: "nope",
      event: { one: "", other: "" },
    });
    expect(map).toEqual({ project: { one: "Program" } });
  });

  it("handles non-objects", () => {
    expect(toLabelMap(null)).toEqual({});
    expect(toLabelMap([])).toEqual({});
  });
});

describe("resolveAll", () => {
  it("returns every key in both forms", () => {
    const all = resolveAll(createTranslator());
    expect(Object.keys(all).sort()).toEqual([...LABEL_KEYS].sort());
    expect(all.document).toEqual(DEFAULT_LABELS.document);
  });
});
