import "server-only";
import { createClient } from "@/lib/supabase/server";
import type { Database } from "@/lib/supabase/database.types";
import type { Translate } from "@/lib/terminology/t";
import { lower } from "@/lib/terminology/t";
import { timeAgo } from "@/lib/activity";

// In-app notifications (D103). RLS returns only the viewer's own. Titles and
// names are read live, through the viewer's own access, so a notification
// about something they can no longer see says so instead of naming it.

export type NotificationType = Database["public"]["Enums"]["notification_type"];

export const NOTIFICATION_TYPES: NotificationType[] = [
  "assigned",
  "claimed",
  "completed",
  "due_soon",
  "overdue",
  "invitation_accepted",
  "low_attendance",
  "task_comment",
  "task_changed",
  "mention",
  "direct_message",
  "channel_message",
  "discussion",
];

/** One notification, ready to show (serialisable, for the bell's panel). */
export type NotificationItem = {
  id: string;
  type: NotificationType;
  sentence: string;
  href: string | null;
  ago: string;
  createdAt: string;
  unread: boolean;
};

type Row = {
  id: string;
  type: NotificationType;
  subject_type: string;
  subject_id: string;
  actor_id: string | null;
  data: { rate?: number; project_id?: string; due_date?: string; changed?: string[] };
  read_at: string | null;
  created_at: string;
};

export async function getUnreadCount(orgId: string): Promise<number> {
  const supabase = await createClient();
  const { count } = await supabase
    .from("notifications")
    .select("id", { count: "exact", head: true })
    .eq("organization_id", orgId)
    .is("read_at", null);
  return count ?? 0;
}

/** Creates the viewer's due-tomorrow and overdue notifications for today, once each. */
export async function queueDueNotifications(orgId: string, today: string): Promise<void> {
  const supabase = await createClient();
  await supabase.rpc("queue_my_due_notifications", { org: orgId, today });
}

export async function getNotifications(
  orgId: string,
  base: string,
  t: Translate,
  { limit = 20, unreadOnly = false }: { limit?: number; unreadOnly?: boolean } = {},
): Promise<NotificationItem[]> {
  const supabase = await createClient();
  let query = supabase
    .from("notifications")
    .select("id, type, subject_type, subject_id, actor_id, data, read_at, created_at")
    .eq("organization_id", orgId)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (unreadOnly) query = query.is("read_at", null);
  const { data, error } = await query;
  if (error) throw error;
  const rows = (data ?? []) as Row[];

  const ids = (type: string) => [...new Set(rows.filter((r) => r.subject_type === type).map((r) => r.subject_id))];
  const taskIds = ids("task");
  const participantIds = ids("participant");
  const channelIds = ids("channel");
  const discussionIds = ids("discussion");
  const actorIds = [...new Set(rows.map((r) => r.actor_id).filter((x): x is string => Boolean(x)))];
  const projectIds = [...new Set(rows.map((r) => r.data.project_id).filter((x): x is string => Boolean(x)))];

  const [tasks, participants, actors, projects, channels, discussions] = await Promise.all([
    taskIds.length ? supabase.from("tasks").select("id, title").in("id", taskIds) : { data: [] },
    participantIds.length ? supabase.from("participants").select("id, name").in("id", participantIds) : { data: [] },
    actorIds.length ? supabase.from("profiles").select("id, full_name, email").in("id", actorIds) : { data: [] },
    projectIds.length ? supabase.from("projects").select("id, name").in("id", projectIds) : { data: [] },
    channelIds.length ? supabase.from("chat_channels").select("id, kind, project_id").in("id", channelIds) : { data: [] },
    discussionIds.length ? supabase.from("discussions").select("id, title").in("id", discussionIds) : { data: [] },
  ]);
  // a program channel is named after its program, read through the viewer's access
  const channelProjects = [...new Set((channels.data ?? []).map((c) => c.project_id).filter((x): x is string => Boolean(x)))];
  const { data: channelProjectNames } = channelProjects.length
    ? await supabase.from("projects").select("id, name").in("id", channelProjects)
    : { data: [] as { id: string; name: string }[] };
  const channelProjectName = new Map((channelProjectNames ?? []).map((p) => [p.id, p.name]));
  const channelOf = new Map(
    (channels.data ?? []).map((c) => [
      c.id,
      c.kind === "org" ? "Everyone" : c.kind === "direct" ? null : (channelProjectName.get(c.project_id ?? "") ?? null),
    ]),
  );
  const discussionOf = new Map((discussions.data ?? []).map((d) => [d.id, d.title]));
  const titleOf = new Map((tasks.data ?? []).map((x) => [x.id, x.title]));
  const personOf = new Map((participants.data ?? []).map((x) => [x.id, x.name]));
  const actorOf = new Map((actors.data ?? []).map((x) => [x.id, x.full_name || x.email]));
  const projectOf = new Map((projects.data ?? []).map((x) => [x.id, x.name]));

  const now = Date.now();
  return rows.map((r) => {
    const { sentence, href } = describe(r, base, t, {
      title: titleOf.get(r.subject_id),
      participant: personOf.get(r.subject_id),
      actor: (r.actor_id && actorOf.get(r.actor_id)) || "Someone",
      project: r.data.project_id ? projectOf.get(r.data.project_id) : undefined,
      channel: channelOf.has(r.subject_id) ? (channelOf.get(r.subject_id) ?? null) : undefined,
      discussion: discussionOf.get(r.subject_id),
    });
    return {
      id: r.id,
      type: r.type,
      sentence,
      href,
      ago: timeAgo(r.created_at, now),
      createdAt: r.created_at,
      unread: r.read_at === null,
    };
  });
}

function describe(
  r: Row,
  base: string,
  t: Translate,
  names: { title?: string; participant?: string; actor: string; project?: string; channel?: string | null; discussion?: string },
): { sentence: string; href: string | null } {
  const task = lower(t("task"));
  if (r.subject_type === "channel") {
    // undefined: they can't see it any more; null: a direct conversation
    if (names.channel === undefined) return { sentence: "A conversation you can no longer see had news.", href: null };
    const href = `${base}/notifications?chat=${r.subject_id}`;
    if (r.type === "direct_message") return { sentence: `${names.actor} sent you a message.`, href };
    if (r.type === "mention") {
      return { sentence: names.channel ? `${names.actor} mentioned you in #${names.channel}.` : `${names.actor} mentioned you in a message.`, href };
    }
    return { sentence: `${names.actor} wrote in #${names.channel ?? "a conversation"}.`, href };
  }
  if (r.subject_type === "discussion") {
    if (names.discussion === undefined) return { sentence: "A discussion you can no longer see had news.", href: null };
    const href = `${base}/discussions/${r.subject_id}`;
    if (r.type === "mention") return { sentence: `${names.actor} mentioned you in “${names.discussion}”.`, href };
    return { sentence: `${names.actor} posted in “${names.discussion}”.`, href };
  }
  if (r.subject_type === "task" && names.title === undefined) {
    // they can't see it any more: don't name it
    return { sentence: `A ${task} you can no longer see was updated.`, href: null };
  }
  const title = `“${names.title}”`;
  const taskHref = `${base}/tasks/${r.subject_id}`;
  switch (r.type) {
    case "task_comment":
      return { sentence: `${names.actor} commented on ${title}.`, href: `${taskHref}#comments` };
    case "mention":
      return { sentence: `${names.actor} mentioned you on ${title}.`, href: `${taskHref}#comments` };
    case "task_changed": {
      const what = (r.data.changed ?? []).map((c) => CHANGE_WORDS[c] ?? c);
      return { sentence: `${names.actor} changed ${what.length ? `the ${listWords(what)} of ` : ""}${title}.`, href: taskHref };
    }
    case "direct_message":
    case "channel_message":
    case "discussion":
      return { sentence: `${names.actor} updated ${title}.`, href: taskHref };
    case "assigned":
      return { sentence: `${names.actor} gave you ${title}.`, href: taskHref };
    case "claimed":
      return { sentence: `${names.actor} claimed ${title}.`, href: taskHref };
    case "completed":
      return { sentence: `${names.actor} finished ${title}.`, href: taskHref };
    case "due_soon":
      return { sentence: `${title} is due tomorrow.`, href: taskHref };
    case "overdue":
      return { sentence: `${title} is overdue.`, href: taskHref };
    case "invitation_accepted":
      return { sentence: `${names.actor} accepted your invitation and joined.`, href: `${base}/settings?view=members` };
    case "low_attendance": {
      if (names.participant === undefined) {
        return { sentence: `A ${lower(t("participant"))}'s ${lower(t("section.attendance"))} fell below your mark.`, href: null };
      }
      const where = names.project ? ` in ${names.project}` : "";
      return {
        sentence: `${names.participant}'s ${lower(t("section.attendance"))}${where} fell to ${r.data.rate ?? "?"}%.`,
        href: `${base}/attendance/participants/${r.subject_id}`,
      };
    }
  }
}

const CHANGE_WORDS: Record<string, string> = { title: "title", due_date: "due date", priority: "priority", status: "status", project: "home" };

function listWords(words: string[]): string {
  return words.length <= 1 ? (words[0] ?? "") : `${words.slice(0, -1).join(", ")} and ${words.at(-1)}`;
}

/** What each kind of notification is about, for Settings → Notifications. */
export function notificationTypeLabel(type: NotificationType, t: Translate): string {
  const task = lower(t("task"));
  switch (type) {
    case "assigned":
      return `Someone gives you a ${task}`;
    case "claimed":
      return `Someone claims a ${task} you made`;
    case "completed":
      return `A ${task} you made, or one on a ${lower(t("project"))} you lead, is finished`;
    case "due_soon":
      return `Your ${task} is due tomorrow`;
    case "overdue":
      return `Your ${task} becomes overdue`;
    case "invitation_accepted":
      return "Someone accepts an invitation you sent";
    case "low_attendance":
      return `A ${lower(t("participant"))}'s ${lower(t("section.attendance"))} falls below the low mark`;
    case "task_comment":
      return `Someone comments on a ${task} you made, are on, or have commented on`;
    case "task_changed":
      return `Someone changes the title, due date, priority or status of a ${task} you're on`;
    case "mention":
      return "Someone mentions you in a comment, chat or discussion";
    case "direct_message":
      return "Someone sends you a direct message";
    case "channel_message":
      return "New messages in a chat you're in (once until you open it)";
    case "discussion":
      return `A new discussion on your ${lower(t("project", "other"))}, or a reply in one you're part of`;
  }
}
