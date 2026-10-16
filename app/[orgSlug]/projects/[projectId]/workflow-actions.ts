"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { id } from "@/lib/validation";

// Setting a program's steps (D107). save_workflow() checks who may, and the rules.

const stepSchema = z.object({
  id: id.optional(),
  name: z.string().trim().min(1, "Give every step a name.").max(40, "Keep step names under 40 characters."),
  kind: z.enum(["open", "done"]),
  wip_limit: z.number().int().min(1, "A limit is at least 1.").max(999).nullable().optional(),
});

const MESSAGES: Record<string, string> = {
  step_count: "Use between 2 and 12 steps.",
  step_kinds: "Keep at least one open step and one done step.",
  step_names: "Give each step its own name.",
  project_archived: "This is archived and read-only.",
};

export async function saveWorkflow(input: {
  projectId: string;
  steps: { id?: string; name: string; kind: "open" | "done"; wip_limit?: number | null }[];
}): Promise<{ ok: true } | { ok: false; message: string }> {
  const parsed = z.object({ projectId: id, steps: z.array(stepSchema).max(12, "Use between 2 and 12 steps.") }).safeParse(input);
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0]?.message ?? "Check the steps and try again." };
  const supabase = await createClient();
  const { error } = await supabase.rpc("save_workflow", {
    project: parsed.data.projectId,
    steps: parsed.data.steps.map((s) => ({ ...(s.id ? { id: s.id } : {}), name: s.name, kind: s.kind, wip_limit: s.wip_limit ?? null })),
  });
  revalidatePath("/[orgSlug]/projects/[projectId]", "page");
  revalidatePath("/[orgSlug]/tasks", "page");
  if (error) {
    return { ok: false, message: MESSAGES[error.hint ?? ""] ?? (error.code === "42501" ? "Only the people who run this can change its steps." : "Couldn't save the steps.") };
  }
  return { ok: true };
}
