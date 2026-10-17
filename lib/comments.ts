import "server-only";
import { createClient } from "@/lib/supabase/server";
import type { OrgContext } from "@/lib/org";
import { formatChatTime } from "@/lib/chat";

// Comments on work and replies in discussions (D106). RLS decides every row:
// can_view_task() for comments, can_view_discussion() for replies.

export type CommentItem = {
  id: string;
  authorId: string | null;
  body: string;
  edited: boolean;
  deleted: boolean;
  createdAt: string;
  time: string;
  fullTime: string;
};

type Row = { id: string; author_id: string | null; body: string; edited_at: string | null; deleted_at: string | null; created_at: string };

export function toCommentItems(rows: Row[], tz: string): CommentItem[] {
  const now = new Date();
  return rows.map((r) => ({
    id: r.id,
    authorId: r.author_id,
    body: r.body,
    edited: r.edited_at !== null,
    deleted: r.deleted_at !== null,
    createdAt: r.created_at,
    ...formatChatTime(r.created_at, tz, now),
  }));
}

export async function getTaskComments(ctx: OrgContext, taskId: string): Promise<{ items: CommentItem[]; mentionable: string[] }> {
  const supabase = await createClient();
  const [{ data, error }, { data: audience }] = await Promise.all([
    supabase
      .from("task_comments")
      .select("id, author_id, body, edited_at, deleted_at, created_at")
      .eq("organization_id", ctx.org.id)
      .eq("task_id", taskId)
      .order("created_at"),
    supabase.rpc("task_audience", { task: taskId }),
  ]);
  if (error) throw error;
  return {
    items: toCommentItems(data ?? [], ctx.tz),
    mentionable: (audience ?? []).map((a) => a.user_id).filter((id) => id !== ctx.userId),
  };
}
