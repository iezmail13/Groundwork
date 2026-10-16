"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { id } from "@/lib/validation";

// Moving a card between a program's steps (D107). move_task_to_step() checks
// who may move it and keeps the done rules.

export type StepMoveResult = { ok: true } | { ok: false; message: string };

const MESSAGES: Record<string, string> = {
  outranked_by_creator: "Someone ranked above you created this, so you can't move it.",
  completion_all: "Each person on this ticks off their own part, so it can't be moved to done for them.",
  project_archived: "This is archived and read-only.",
  wrong_step: "That step isn't on this board any more. Refresh to see the latest.",
};

export async function moveTaskToStep(input: { taskId: string; stepId: string; position?: number }): Promise<StepMoveResult> {
  const parsed = z.object({ taskId: id, stepId: id, position: z.number().finite().optional() }).safeParse(input);
  if (!parsed.success) return { ok: false, message: "Couldn't move that card." };
  const supabase = await createClient();
  const { error } = await supabase.rpc("move_task_to_step", {
    task: parsed.data.taskId,
    step: parsed.data.stepId,
    new_position: parsed.data.position,
  });
  revalidatePath("/[orgSlug]/tasks", "page");
  revalidatePath("/[orgSlug]/projects/[projectId]", "page");
  if (error) {
    return { ok: false, message: MESSAGES[error.hint ?? ""] ?? (error.code === "42501" ? "Only the people on it, or someone who can edit it, can move it." : "Couldn't move that card.") };
  }
  return { ok: true };
}
