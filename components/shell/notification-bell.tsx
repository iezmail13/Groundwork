"use client";

import { useCallback, useEffect, useId, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  AlarmClock,
  Bell,
  CheckCheck,
  CircleCheck,
  Hand,
  MailCheck,
  TrendingDown,
  TriangleAlert,
  UserPlus,
  X,
  type LucideIcon,
} from "lucide-react";
import {
  loadNotifications,
  markAllNotificationsRead,
  markNotification,
  unreadCount,
} from "@/app/[orgSlug]/notifications/actions";
import type { NotificationItem, NotificationType } from "@/lib/notifications";

export const NOTIFICATION_ICONS: Record<NotificationType, LucideIcon> = {
  assigned: UserPlus,
  claimed: Hand,
  completed: CircleCheck,
  due_soon: AlarmClock,
  overdue: TriangleAlert,
  invitation_accepted: MailCheck,
  low_attendance: TrendingDown,
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
  const [open, setOpen] = useState(false);
  const [unread, setUnread] = useState(initialUnread);
  const [items, setItems] = useState<NotificationItem[] | null>(null);
  const [loading, startLoading] = useTransition();
  const router = useRouter();
  const panelId = useId();
  const headingId = useId();
  const buttonRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

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

  useEffect(() => {
    if (!open) return;
    panelRef.current?.querySelector<HTMLElement>("[data-autofocus]")?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
        buttonRef.current?.focus();
      }
    };
    const onPointer = (e: PointerEvent) => {
      const target = e.target as Node;
      if (!panelRef.current?.contains(target) && !buttonRef.current?.contains(target)) setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("pointerdown", onPointer);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("pointerdown", onPointer);
    };
  }, [open]);

  const toggle = () => {
    const next = !open;
    setOpen(next);
    if (next) refresh();
  };

  const markAll = () =>
    startLoading(async () => {
      await markAllNotificationsRead({ orgSlug });
      setItems((list) => list?.map((n) => ({ ...n, unread: false })) ?? null);
      setUnread(0);
      router.refresh();
    });

  const follow = async (n: NotificationItem) => {
    if (n.unread) {
      setUnread((c) => Math.max(0, c - 1));
      setItems((list) => list?.map((x) => (x.id === n.id ? { ...x, unread: false } : x)) ?? null);
      await markNotification({ id: n.id, read: true });
    }
    setOpen(false);
  };

  const label = unread ? `Notifications, ${unread} unread` : "Notifications";

  return (
    <div className="relative">
      <button
        ref={buttonRef}
        type="button"
        aria-label={label}
        aria-expanded={open}
        aria-controls={panelId}
        onClick={toggle}
        className={`relative inline-flex size-9 items-center justify-center rounded-md border border-transparent ${
          onRail ? "hover:bg-rail-hover" : "text-ink hover:border-rule hover:bg-panel"
        }`}
      >
        <Bell aria-hidden className="size-5" />
        {unread > 0 ? (
          <span
            aria-hidden
            className="absolute -top-1 -right-1 inline-flex min-w-5 items-center justify-center rounded-full border-2 border-canvas bg-bad px-1 font-heading text-[11px] leading-4 font-bold text-canvas"
          >
            {unread > 99 ? "99+" : unread}
          </span>
        ) : null}
      </button>

      {open ? (
        <div
          ref={panelRef}
          id={panelId}
          role="dialog"
          aria-labelledby={headingId}
          className="fixed inset-0 z-50 flex flex-col bg-canvas text-ink min-[900px]:absolute min-[900px]:inset-auto min-[900px]:top-full min-[900px]:right-0 min-[900px]:mt-2 min-[900px]:max-h-[70vh] min-[900px]:w-[24rem] min-[900px]:rounded-lg min-[900px]:border min-[900px]:border-rule"
        >
          <div className="flex items-center gap-2 border-b border-rule px-4 py-3">
            <h2 id={headingId} tabIndex={-1} data-autofocus className="font-heading text-base font-bold focus:outline-none">
              Notifications
            </h2>
            <button
              type="button"
              onClick={markAll}
              disabled={loading || unread === 0}
              className="ml-auto inline-flex items-center gap-1 rounded px-2 py-1 font-heading text-sm font-semibold text-accent hover:underline disabled:text-ink-muted disabled:no-underline"
            >
              <CheckCheck aria-hidden className="size-4" />
              Mark all read
            </button>
            <button
              type="button"
              aria-label="Close notifications"
              onClick={() => {
                setOpen(false);
                buttonRef.current?.focus();
              }}
              className="inline-flex size-8 items-center justify-center rounded hover:bg-panel"
            >
              <X aria-hidden className="size-4" />
            </button>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto" aria-busy={loading}>
            {items === null ? (
              <p className="px-4 py-6 text-sm text-ink-muted">Loading…</p>
            ) : items.length === 0 ? (
              <p className="px-4 py-6 text-sm text-ink-muted">Nothing yet. You&apos;ll hear here when someone gives you work or something you care about changes.</p>
            ) : (
              <ul className="divide-y divide-rule">
                {items.map((n) => (
                  <li key={n.id}>
                    <NotificationRow item={n} onFollow={() => follow(n)} />
                  </li>
                ))}
              </ul>
            )}
          </div>
          <div className="border-t border-rule px-4 py-3">
            <Link
              href={`/${orgSlug}/notifications`}
              onClick={() => setOpen(false)}
              className="font-heading text-sm font-semibold text-accent hover:underline"
            >
              See all notifications
            </Link>
          </div>
        </div>
      ) : null}
    </div>
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
