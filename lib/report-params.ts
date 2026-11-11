import { z } from "zod";
import { addDays, isIsoDate } from "@/lib/dates";
import { REPORT_TEMPLATES, type ReportTemplate } from "@/lib/report-model";

// Reading a report's settings from a form or the address bar (D109).

export const reportParamsSchema = z
  .object({
    template: z.enum(REPORT_TEMPLATES as [ReportTemplate, ...ReportTemplate[]]),
    projectId: z.union([z.literal(""), z.guid()]).optional(),
    from: z.string().refine(isIsoDate, "Pick a start date."),
    to: z.string().refine(isIsoDate, "Pick an end date."),
  })
  .refine((p) => p.from <= p.to, { message: "The end date must be on or after the start date.", path: ["to"] });

export function readReportParams(sp: Record<string, string | string[] | undefined>, today: string) {
  const get = (k: string) => (typeof sp[k] === "string" ? (sp[k] as string) : undefined);
  const parsed = reportParamsSchema.safeParse({
    template: get("template") ?? "progress",
    projectId: get("project") ?? "",
    from: get("from") ?? addDays(today, -29),
    to: get("to") ?? today,
  });
  if (!parsed.success) return null;
  return { template: parsed.data.template, projectId: parsed.data.projectId || null, from: parsed.data.from, to: parsed.data.to };
}
