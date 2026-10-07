import { describe, expect, it } from "vitest";
import { findViolations } from "@/scripts/label-check-core";

const check = (src: string) => findViolations("x.tsx", src).map((v) => v.text);

describe("check:labels", () => {
  it("flags primitive labels in JSX text", () => {
    expect(check(`export const A = () => <h1>Projects</h1>;`)).toEqual(["Projects"]);
    expect(check(`export const A = () => <p>No tasks yet</p>;`)).toEqual(["No tasks yet"]);
  });

  it("flags copy attributes and capitalised strings", () => {
    expect(check(`export const A = () => <input placeholder="Search documents" />;`)).toEqual(["Search documents"]);
    expect(check(`const msg = "Could not save the task";`)).toEqual(["Could not save the task"]);
    expect(check("const title = `New Session`;")).toEqual(["New Session"]);
  });

  it("allows labels that come from t()", () => {
    expect(check(`export const A = ({t}) => <h1>{t("project", "other")}</h1>;`)).toEqual([]);
  });

  it("ignores code-like strings", () => {
    expect(
      check(`
        import x from "./projects";
        const a = supabase.from("tasks").select("id, title, project:projects(name)");
        const href = \`/\${slug}/projects\`;
        if (entity === "task") {}
        const key = { "status.todo": 1 };
        type S = "task" | "event";
      `),
    ).toEqual([]);
  });
});
