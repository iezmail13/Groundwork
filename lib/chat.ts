import "server-only";
import { createClient } from "@/lib/supabase/server";
import { getMembers, initials, type OrgContext } from "@/lib/org";
import { getMemberPhotos } from "@/lib/members";

// Chat (D106). Every read here goes through RLS, so can_view_channel() and
// the history window decide what comes back. Names and photos are read live.

export type ChatKind = "org" | "project" | "direct";

export type ChatChannel = {
  id: string;
  kind: ChatKind;
  title: string;
  projectId: string | null;
  /** The other person, in a direct conversation. */
  otherUserId: string | null;
  /** One of the channel's own people, not an owner looking in. */
  joined: boolean;
  muted: boolean;
  lastMessageAt: string | null;
  unread: number;
};

export type ChatPerson = { userId: string; name: string; initials: string; photoUrl: string | null; href: string };

export type ChatMessage = {
  id: string;
  senderId: string | null;
  body: string;
  edited: boolean;
  deleted: boolean;
  createdAt: string;
  /** When it was sent, in the viewer's time zone: "3:04 PM" today, "Oct 14, 3:04 PM" before. */
  time: string;
  /** The full date and time, for the tooltip and screen readers. */
  fullTime: string;
};

/** The organization's people, by user id, for names, photos and the mention picker. */
export async function getChatPeople(ctx: OrgContext): Promise<Record<string, ChatPerson>> {
  const [members, photos] = await Promise.all([getMembers(ctx.org.id), getMemberPhotos(ctx.org.id)]);
  return Object.fromEntries(
    members.map((m) => [
      m.userId,
      { userId: m.userId, name: m.name, initials: initials(m.name), photoUrl: photos.get(m.userId) ?? null, href: `${ctx.base}/members/${m.userId}` },
    ]),
  );
}

/** The viewer's conversations: the organization's first, then programs by name, then direct messages, latest first. */
export async function getChannels(ctx: OrgContext, people: Record<string, ChatPerson>): Promise<ChatChannel[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("my_chat_channels", { org: ctx.org.id });
  if (error) throw error;
  const rank: Record<ChatKind, number> = { org: 0, project: 1, direct: 2 };
  return (data ?? [])
    .map((c) => ({
      id: c.id,
      kind: c.kind,
      title:
        c.kind === "org" ? "Everyone" : c.kind === "project" ? (c.project_name ?? "") : (people[c.other_user ?? ""]?.name ?? "Someone who left"),
      projectId: c.project_id,
      otherUserId: c.other_user,
      joined: c.joined,
      muted: c.muted,
      lastMessageAt: c.last_message_at,
      unread: c.unread,
    }))
    .sort(
      (a, b) =>
        rank[a.kind] - rank[b.kind] ||
        (a.kind === "direct" ? (b.lastMessageAt ?? "").localeCompare(a.lastMessageAt ?? "") : a.title.localeCompare(b.title)),
    );
}

/** Unread messages in the viewer's own conversations, for the chat button. */
export async function getChatUnread(ctx: OrgContext): Promise<number> {
  const supabase = await createClient();
  const { data } = await supabase.rpc("my_chat_channels", { org: ctx.org.id });
  return (data ?? []).filter((c) => c.joined && !c.muted).reduce((sum, c) => sum + c.unread, 0);
}

export function formatChatTime(iso: string, tz: string, now = new Date()): { time: string; fullTime: string } {
  const date = new Date(iso);
  const day = (d: Date) => new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
  const clock = new Intl.DateTimeFormat("en-US", { timeZone: tz, hour: "numeric", minute: "2-digit" }).format(date);
  const sameDay = day(date) === day(now);
  const sameYear = day(date).slice(0, 4) === day(now).slice(0, 4);
  const dated = new Intl.DateTimeFormat("en-US", { timeZone: tz, month: "short", day: "numeric", ...(sameYear ? {} : { year: "numeric" }) }).format(date);
  const full = new Intl.DateTimeFormat("en-US", { timeZone: tz, dateStyle: "full", timeStyle: "short" }).format(date);
  return { time: sameDay ? clock : `${dated}, ${clock}`, fullTime: full };
}

/** The latest messages in a conversation, oldest first, and who can be mentioned there. */
export async function getConversation(
  ctx: OrgContext,
  channelId: string,
  limit = 100,
): Promise<{ messages: ChatMessage[]; mentionable: string[]; more: boolean }> {
  const supabase = await createClient();
  const [{ data, error }, { data: people }] = await Promise.all([
    supabase
      .from("chat_messages")
      .select("id, sender_id, body, edited_at, deleted_at, created_at")
      .eq("organization_id", ctx.org.id)
      .eq("channel_id", channelId)
      .order("created_at", { ascending: false })
      .limit(limit + 1),
    supabase.rpc("chat_channel_people", { channel: channelId }),
  ]);
  if (error) throw error;
  const rows = data ?? [];
  const now = new Date();
  return {
    more: rows.length > limit,
    mentionable: (people ?? []).map((p) => p.user_id).filter((id) => id !== ctx.userId),
    messages: rows
      .slice(0, limit)
      .reverse()
      .map((m) => ({
        id: m.id,
        senderId: m.sender_id,
        body: m.body,
        edited: m.edited_at !== null,
        deleted: m.deleted_at !== null,
        createdAt: m.created_at,
        ...formatChatTime(m.created_at, ctx.tz, now),
      })),
  };
}
