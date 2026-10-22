"use server";

import { createHash, randomBytes } from "node:crypto";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import type { Json } from "@/lib/supabase/database.types";
import { getOrgContext } from "@/lib/org";
import { buildReport } from "@/lib/reports";
import { reportParamsSchema } from "@/lib/report-params";
import { getProjectOptions } from "@/lib/queries";
import { siteOrigin } from "@/lib/urls";
import { id } from "@/lib/validation";
import { DEMO_ONLY } from "@/lib/demo";

// Sharing reports (D109): a snapshot of the report as its author sees it,
// behind a long random token whose SHA-256 alone is stored. No email.

const slug = z.string().regex(/^[a-z0-9-]{1,48}$/);

export type ShareResult = { ok: true; url: string } | { ok: false; message: string };

export async function createShareLink(input: {
  orgSlug: string;
  template: string;
  projectId: string;
  from: string;
  to: string;
  days: number;
}): Promise<ShareResult> {
  const parsed = z
    .object({ orgSlug: slug, days: z.union([z.literal(7), z.literal(30), z.literal(90)]) })
    .and(reportParamsSchema)
    .safeParse(input);
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0]?.message ?? "Check the report settings." };
  const p = parsed.data;
  const ctx = await getOrgContext(p.orgSlug);
  if (p.template === "attendance") return { ok: false, message: `${ctx.t("section.attendance")} reports hold personal details, so they can't be shared by link.` };
  const projects = await getProjectOptions(ctx.org.id, true);
  const project = p.projectId ? projects.find((x) => x.id === p.projectId) : null;
  const report = await buildReport(ctx, { template: p.template, projectId: project?.id ?? null, from: p.from, to: p.to }, project?.name ?? "Everything you can see");
  if (!report) return { ok: false, message: "You can't create that report." };
  const token = randomBytes(32).toString("hex");
  const supabase = await createClient();
  // the database sets who shared it, when, and for how long (D113)
  const { data: shareId, error } = await supabase.rpc("create_report_share", {
    org: ctx.org.id,
    template: p.template,
    title: `${report.title}: ${report.scope}`.slice(0, 200),
    snapshot: report as unknown as Json,
    token_hash: createHash("sha256").update(token).digest("hex"),
    days: p.days,
  });
  if (error?.hint === "demo_only") return { ok: false, message: DEMO_ONLY };
  if (error || !shareId) return { ok: false, message: "Couldn't create the link. Try again." };
  await supabase.rpc("log_report", { org: ctx.org.id, report: shareId, action: "shared", details: { template: p.template, from: p.from, to: p.to } });
  revalidatePath("/[orgSlug]/reports", "page");
  return { ok: true, url: `${await siteOrigin()}/r/${token}` };
}

export async function revokeShareLink(input: { orgSlug: string; shareId: string }): Promise<{ ok: boolean }> {
  const parsed = z.object({ orgSlug: slug, shareId: id }).safeParse(input);
  if (!parsed.success) return { ok: false };
  const ctx = await getOrgContext(parsed.data.orgSlug);
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("report_shares")
    .update({ revoked_at: new Date().toISOString() })
    .eq("id", parsed.data.shareId)
    .is("revoked_at", null)
    .select("id, template");
  if (error || !data?.length) return { ok: false };
  await supabase.rpc("log_report", { org: ctx.org.id, report: parsed.data.shareId, action: "revoked", details: { template: data[0]!.template } });
  revalidatePath("/[orgSlug]/reports", "page");
  return { ok: true };
}

/** Printing (to paper or PDF) is recorded like any other export. */
export async function recordPrint(input: { orgSlug: string; template: string; from: string; to: string }): Promise<void> {
  const parsed = z.object({ orgSlug: slug, template: z.string().max(20), from: z.string().max(10), to: z.string().max(10) }).safeParse(input);
  if (!parsed.success) return;
  const ctx = await getOrgContext(parsed.data.orgSlug);
  const supabase = await createClient();
  await supabase.rpc("log_report", { org: ctx.org.id, action: "printed", details: { template: parsed.data.template, from: parsed.data.from, to: parsed.data.to } });
}
