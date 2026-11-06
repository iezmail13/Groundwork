import "server-only";
import { createClient } from "@/lib/supabase/server";
import type { OrgContext } from "@/lib/org";
import { formatChatTime } from "@/lib/chat";
import { toCommentItems, type CommentItem } from "@/lib/comments";

// Discussion boards (D106). RLS and can_view_discussion() decide every row.

export type DiscussionSummary = {
  id: string;
  title: string;
  projectId: string | null;
  projectName: string | null;
  authorId: string | null;
  replies: number;
  lastActivity: string;
  lastActivityAt: string;
};

export async function getDiscussions(ctx: OrgContext, opts: { projectId?: string | null; limit?: number } = {}): Promise<DiscussionSummary[]> {
  const supabase = await createClient();
  let q = supabase
    .from("discussions")
    .select("id, title, project_id, author_id, last_activity_at, project:projects(name), replies:discussion_replies(count)")
    .eq("organization_id", ctx.org.id)
    .order("last_activity_at", { ascending: false })
    .limit(opts.limit ?? 100);
  if (opts.projectId === null) q = q.is("project_id", null);
  else if (opts.projectId) q = q.eq("project_id", opts.projectId);
  const { data, error } = await q;
  if (error) throw error;
  const now = new Date();
  return (data ?? []).map((d) => ({
    id: d.id,
    title: d.title,
    projectId: d.project_id,
    projectName: d.project?.name ?? null,
    authorId: d.author_id,
    replies: d.replies?.[0]?.count ?? 0,
    lastActivity: formatChatTime(d.last_activity_at, ctx.tz, now).time,
    lastActivityAt: d.last_activity_at,
  }));
}

export type DiscussionThread = {
  id: string;
  title: string;
  body: string;
  projectId: string | null;
  projectName: string | null;
  authorId: string | null;
  edited: boolean;
  time: string;
  fullTime: string;
  createdAt: string;
  canRemove: boolean;
  replies: CommentItem[];
  mentionable: string[];
};

export async function getDiscussion(ctx: OrgContext, id: string): Promise<DiscussionThread | null> {
  const supabase = await createClient();
  const { data: d } = await supabase
    .from("discussions")
    .select("id, title, body, project_id, author_id, edited_at, created_at, project:projects(name)")
    .eq("organization_id", ctx.org.id)
    .eq("id", id)
    .maybeSingle();
  if (!d) return null;
  const [{ data: replies }, { data: audience }, { data: canRemove }] = await Promise.all([
    supabase
      .from("discussion_replies")
      .select("id, author_id, body, edited_at, deleted_at, created_at")
      .eq("discussion_id", id)
      .order("created_at"),
    supabase.rpc("discussion_audience", { discussion: id }),
    supabase.rpc("can_remove_discussion", { discussion: id }),
  ]);
  return {
    id: d.id,
    title: d.title,
    body: d.body,
    projectId: d.project_id,
    projectName: d.project?.name ?? null,
    authorId: d.author_id,
    edited: d.edited_at !== null,
    createdAt: d.created_at,
    ...formatChatTime(d.created_at, ctx.tz),
    canRemove: Boolean(canRemove),
    replies: toCommentItems(replies ?? [], ctx.tz),
    mentionable: (audience ?? []).map((a) => a.user_id).filter((u) => u !== ctx.userId),
  };
}
