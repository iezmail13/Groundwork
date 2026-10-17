"use client";

import { useCallback, useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  AlarmClock,
  AtSign,
  MessageSquare,
  MessageSquareText,
  MessagesSquare,
  PencilLine,
  ScrollText,
  Bell,
  CheckCheck,
  CircleCheck,
  Hand,
  MailCheck,
  TrendingDown,
  TriangleAlert,
  UserPlus,
  type LucideIcon,
} from "lucide-react";
import {
  loadNotifications,
  markAllNotificationsRead,
  markNotification,
  unreadCount,
} from "@/app/[orgSlug]/notifications/actions";
import type { NotificationItem, NotificationType } from "@/lib/notifications";
import { TopBarPanel } from "@/components/shell/top-bar-panel";

export const NOTIFICATION_ICONS: Record<NotificationType, LucideIcon> = {
  assigned: UserPlus,
  claimed: Hand,
  completed: CircleCheck,
  due_soon: AlarmClock,
  overdue: TriangleAlert,
  invitation_accepted: MailCheck,
  low_attendance: TrendingDown,
  task_comment: MessageSquareText,
  task_changed: PencilLine,
  mention: AtSign,
  direct_message: MessageSquare,
  channel_message: MessagesSquare,
  discussion: ScrollText,
};

/** Overdue and low attendance are bad news, finished work good news (status colours, D83). */
export const NOTIFICATION_TONE: Partial<Record<NotificationType, string>> = {
  overdue: "text-bad",
  low_attendance: "text-bad",
  completed: "text-good",
  due_soon: "text-warn",
};

/**
 * The bell in the top bar (D103): an unread count, and a panel with the
 * latest notifications (a popover on wide screens, a full-height sheet on
 * small ones), Mark all read, and a link to the full page.
 */
export function NotificationBell({ orgSlug, initialUnread, onRail = false }: { orgSlug: string; initialUnread: number; onRail?: boolean }) {
  const [unread, setUnread] = useState(initialUnread);
  const [items, setItems] = useState<NotificationItem[] | null>(null);
  const [loading, startLoading] = useTransition();
  const router = useRouter();

  const refresh = useCallback(
    () =>
      startLoading(async () => {
        const result = await loadNotifications({ orgSlug });
        if (result.ok) {
          setItems(result.items);
          setUnread(result.unread);
        }
      }),
    [orgSlug],
  );

  // keep the count fresh while the page stays open
  useEffect(() => {
    const timer = window.setInterval(async () => {
      if (document.visibilityState !== "visible") return;
      const n = await unreadCount({ orgSlug });
      if (n !== null) setUnread(n);
    }, 60_000);
    return () => window.clearInterval(timer);
  }, [orgSlug]);

  const markAll = () =>
    startLoading(async () => {
      await markAllNotificationsRead({ orgSlug });
      setItems((list) => list?.map((n) => ({ ...n, unread: false })) ?? null);
      setUnread(0);
      router.refresh();
    });

  const follow = async (n: NotificationItem, close: () => void) => {
    if (n.unread) {
      setUnread((c) => Math.max(0, c - 1));
      setItems((list) => list?.map((x) => (x.id === n.id ? { ...x, unread: false } : x)) ?? null);
      await markNotification({ id: n.id, read: true });
    }
    close();
  };

  return (
    <TopBarPanel
      label={unread ? `Notifications, ${unread} unread` : "Notifications"}
      icon={<Bell aria-hidden className="size-5" />}
      badge={
        unread > 0 ? (
          <span
            aria-hidden
            className="absolute -top-1 -right-1 inline-flex min-w-5 items-center justify-center rounded-full border-2 border-canvas bg-bad px-1 font-heading text-[11px] leading-4 font-bold text-canvas"
          >
            {unread > 99 ? "99+" : unread}
          </span>
        ) : null
      }
      heading="Notifications"
      onOpen={refresh}
      busy={loading}
      onRail={onRail}
      actions={
        <button
          type="button"
          onClick={markAll}
          disabled={loading || unread === 0}
          className="inline-flex items-center gap-1 rounded px-2 py-1 font-heading text-sm font-semibold text-accent hover:underline disabled:text-ink-muted disabled:no-underline"
        >
          <CheckCheck aria-hidden className="size-4" />
          Mark all read
        </button>
      }
      footer={(close) => (
        <Link href={`/${orgSlug}/notifications`} onClick={close} className="font-heading text-sm font-semibold text-accent hover:underline">
          See all notifications
        </Link>
      )}
    >
      {(close) =>
        items === null ? (
          <p className="px-4 py-6 text-sm text-ink-muted">Loading…</p>
        ) : items.length === 0 ? (
          <p className="px-4 py-6 text-sm text-ink-muted">Nothing yet. You&apos;ll hear here when someone gives you work or something you care about changes.</p>
        ) : (
          <ul className="divide-y divide-rule">
            {items.map((n) => (
              <li key={n.id}>
                <NotificationRow item={n} onFollow={() => follow(n, close)} />
              </li>
            ))}
          </ul>
        )
      }
    </TopBarPanel>
  );
}

export function NotificationRow({ item, onFollow }: { item: NotificationItem; onFollow?: () => void }) {
  const Icon = NOTIFICATION_ICONS[item.type];
  const body = (
    <>
      <Icon aria-hidden className={`mt-0.5 size-4 shrink-0 ${NOTIFICATION_TONE[item.type] ?? "text-accent"}`} />
      <span className="min-w-0 flex-1">
        <span className={`block text-sm ${item.unread ? "font-semibold" : ""}`}>
          {item.unread ? <span className="sr-only">Unread: </span> : null}
          {item.sentence}
        </span>
        <span className="block text-xs text-ink-muted">{item.ago}</span>
      </span>
      {item.unread ? <span aria-hidden className="mt-1.5 size-2 shrink-0 rounded-full bg-accent" /> : null}
    </>
  );
  const cls = `flex items-start gap-3 px-4 py-3 ${item.unread ? "bg-accent-tint/40" : ""}`;
  return item.href ? (
    <Link href={item.href} onClick={onFollow} className={`${cls} hover:bg-panel`}>
      {body}
    </Link>
  ) : (
    <div className={cls}>{body}</div>
  );
}
