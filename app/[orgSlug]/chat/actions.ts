"use server";

import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { getOrgContext } from "@/lib/org";
import { getChannels, getChatPeople, getChatUnread, getConversation, type ChatChannel, type ChatMessage, type ChatPerson } from "@/lib/chat";
import { MAX_MESSAGE_LENGTH } from "@/lib/chat-text";
import { id } from "@/lib/validation";

// Chat (D106). Every read and write goes through RLS and can_view_channel();
// these actions validate input and shape results for the panel.

const slug = z.string().regex(/^[a-z0-9-]{1,48}$/);
const body = z
  .string()
  .transform((s) => s.trim())
  .pipe(z.string().min(1, "Write a message first.").max(MAX_MESSAGE_LENGTH, `Keep it under ${MAX_MESSAGE_LENGTH} characters.`));

export type ChatOverview =
  | { ok: true; me: string; channels: ChatChannel[]; people: Record<string, ChatPerson>; unread: number }
  | { ok: false };

export async function loadChat(input: { orgSlug: string }): Promise<ChatOverview> {
  const parsed = z.object({ orgSlug: slug }).safeParse(input);
  if (!parsed.success) return { ok: false };
  const ctx = await getOrgContext(parsed.data.orgSlug);
  const people = await getChatPeople(ctx);
  const channels = await getChannels(ctx, people);
  const unread = channels.filter((c) => c.joined && !c.muted).reduce((s, c) => s + c.unread, 0);
  return { ok: true, me: ctx.userId, channels, people, unread };
}

export async function chatUnread(input: { orgSlug: string }): Promise<number | null> {
  const parsed = z.object({ orgSlug: slug }).safeParse(input);
  if (!parsed.success) return null;
  return getChatUnread(await getOrgContext(parsed.data.orgSlug));
}

export type ConversationData =
  | { ok: true; messages: ChatMessage[]; mentionable: string[]; more: boolean }
  | { ok: false; error: string };

/** A conversation's latest messages; opening it marks it read. */
export async function loadConversation(input: { orgSlug: string; channelId: string }): Promise<ConversationData> {
  const parsed = z.object({ orgSlug: slug, channelId: id }).safeParse(input);
  if (!parsed.success) return { ok: false, error: "That conversation doesn't exist." };
  const ctx = await getOrgContext(parsed.data.orgSlug);
  const supabase = await createClient();
  const { error } = await supabase.rpc("mark_channel_read", { channel: parsed.data.channelId });
  if (error) return { ok: false, error: "You can't see that conversation." };
  const data = await getConversation(ctx, parsed.data.channelId);
  return { ok: true, ...data };
}

export type SendResult = { ok: true } | { ok: false; error: string };

export async function sendMessage(input: { orgSlug: string; channelId: string; body: string }): Promise<SendResult> {
  const parsed = z.object({ orgSlug: slug, channelId: id, body }).safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Couldn't send." };
  const ctx = await getOrgContext(parsed.data.orgSlug);
  const supabase = await createClient();
  const { error } = await supabase
    .from("chat_messages")
    .insert({ organization_id: ctx.org.id, channel_id: parsed.data.channelId, sender_id: ctx.userId, body: parsed.data.body });
  return error ? { ok: false, error: "Couldn't send. You may no longer be in this conversation." } : { ok: true };
}

export async function editMessage(input: { messageId: string; body: string }): Promise<SendResult> {
  const parsed = z.object({ messageId: id, body }).safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Couldn't save." };
  const supabase = await createClient();
  const { data, error } = await supabase.from("chat_messages").update({ body: parsed.data.body }).eq("id", parsed.data.messageId).select("id");
  return error || !data?.length ? { ok: false, error: "Couldn't save that edit." } : { ok: true };
}

export async function deleteMessage(input: { messageId: string }): Promise<SendResult> {
  const parsed = z.object({ messageId: id }).safeParse(input);
  if (!parsed.success) return { ok: false, error: "Couldn't delete." };
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("chat_messages")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", parsed.data.messageId)
    .select("id");
  return error || !data?.length ? { ok: false, error: "Couldn't delete that message." } : { ok: true };
}

export async function openDirect(input: { orgSlug: string; userId: string }): Promise<{ ok: true; channelId: string } | { ok: false; error: string }> {
  const parsed = z.object({ orgSlug: slug, userId: id }).safeParse(input);
  if (!parsed.success) return { ok: false, error: "Pick someone to message." };
  const ctx = await getOrgContext(parsed.data.orgSlug);
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("open_direct_channel", { org: ctx.org.id, other: parsed.data.userId });
  return error || !data ? { ok: false, error: "Couldn't start that conversation." } : { ok: true, channelId: data };
}

/** Muting a conversation (from its header) stops its notifications, not its unread count. */
export async function setChannelMuted(input: { orgSlug: string; channelId: string; muted: boolean }): Promise<SendResult> {
  const parsed = z.object({ orgSlug: slug, channelId: id, muted: z.boolean() }).safeParse(input);
  if (!parsed.success) return { ok: false, error: "Couldn't change that." };
  const ctx = await getOrgContext(parsed.data.orgSlug);
  const supabase = await createClient();
  const { error } = parsed.data.muted
    ? await supabase
        .from("notification_mutes")
        .insert({ organization_id: ctx.org.id, user_id: ctx.userId, muted_channel_id: parsed.data.channelId })
    : await supabase.from("notification_mutes").delete().eq("user_id", ctx.userId).eq("muted_channel_id", parsed.data.channelId);
  return error ? { ok: false, error: "Couldn't change that." } : { ok: true };
}
