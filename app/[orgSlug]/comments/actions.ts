"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { getOrgContext } from "@/lib/org";
import { id } from "@/lib/validation";

// Comments on work and replies in discussions (D106). RLS and the triggers
// decide who may write, edit or delete; these validate input.

const slug = z.string().regex(/^[a-z0-9-]{1,48}$/);
const kind = z.enum(["task", "discussion"]);
const body = z
  .string()
  .transform((s) => s.trim())
  .pipe(z.string().min(1, "Write something first.").max(4000, "Keep it under 4000 characters."));

export type CommentResult = { ok: true } | { ok: false; error: string };

const TABLE = { task: "task_comments", discussion: "discussion_replies" } as const;

function revalidate(kind: "task" | "discussion") {
  revalidatePath(kind === "task" ? "/[orgSlug]/tasks/[taskId]" : "/[orgSlug]/discussions/[discussionId]", "page");
}

export async function addComment(input: { orgSlug: string; kind: "task" | "discussion"; targetId: string; body: string }): Promise<CommentResult> {
  const parsed = z.object({ orgSlug: slug, kind, targetId: id, body }).safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Couldn't post." };
  const ctx = await getOrgContext(parsed.data.orgSlug);
  const supabase = await createClient();
  const { kind: k, targetId, body: text } = parsed.data;
  const { error } =
    k === "task"
      ? await supabase.from("task_comments").insert({ organization_id: ctx.org.id, task_id: targetId, author_id: ctx.userId, body: text })
      : await supabase
          .from("discussion_replies")
          .insert({ organization_id: ctx.org.id, discussion_id: targetId, author_id: ctx.userId, body: text });
  revalidate(k);
  return error ? { ok: false, error: "Couldn't post. You may no longer be able to see this." } : { ok: true };
}

export async function editComment(input: { kind: "task" | "discussion"; commentId: string; body: string }): Promise<CommentResult> {
  const parsed = z.object({ kind, commentId: id, body }).safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Couldn't save." };
  const supabase = await createClient();
  const { data, error } = await supabase
    .from(TABLE[parsed.data.kind])
    .update({ body: parsed.data.body })
    .eq("id", parsed.data.commentId)
    .select("id");
  revalidate(parsed.data.kind);
  return error || !data?.length ? { ok: false, error: "Couldn't save that edit." } : { ok: true };
}

export async function deleteComment(input: { kind: "task" | "discussion"; commentId: string }): Promise<CommentResult> {
  const parsed = z.object({ kind, commentId: id }).safeParse(input);
  if (!parsed.success) return { ok: false, error: "Couldn't delete." };
  const supabase = await createClient();
  const { data, error } = await supabase
    .from(TABLE[parsed.data.kind])
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", parsed.data.commentId)
    .select("id");
  revalidate(parsed.data.kind);
  return error || !data?.length ? { ok: false, error: "Couldn't delete that." } : { ok: true };
}
