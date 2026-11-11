"use client";

import { useOptimistic, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CheckCheck } from "lucide-react";
import { markAllNotificationsRead, markNotification } from "@/app/[orgSlug]/notifications/actions";
import { NOTIFICATION_ICONS, NOTIFICATION_TONE } from "@/components/shell/notification-bell";
import { Button } from "@/components/ui/button";
import type { NotificationItem } from "@/lib/notifications";

type Item = NotificationItem & { when: string };

/** The full list (D103): every notification, with read and unread toggles. */
export function NotificationList({ orgSlug, items, emptyText }: { orgSlug: string; items: Item[]; emptyText: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [shown, setShown] = useOptimistic(items, (list: Item[], change: { id: string | "all"; unread: boolean }) =>
    list.map((n) => (change.id === "all" || n.id === change.id ? { ...n, unread: change.unread } : n)),
  );
  const anyUnread = shown.some((n) => n.unread);

  const toggle = (n: Item) =>
    start(async () => {
      setShown({ id: n.id, unread: !n.unread });
      await markNotification({ id: n.id, read: n.unread });
      router.refresh();
    });

  if (items.length === 0) return <p className="text-ink-muted">{emptyText}</p>;

  return (
    <div className="flex flex-col gap-4">
      <div>
        <Button
          variant="secondary"
          disabled={pending || !anyUnread}
          onClick={() =>
            start(async () => {
              setShown({ id: "all", unread: false });
              await markAllNotificationsRead({ orgSlug });
              router.refresh();
            })
          }
        >
          <CheckCheck aria-hidden className="size-4" />
          Mark all read
        </Button>
      </div>
      <ul className="divide-y divide-rule border-y border-rule">
        {shown.map((n) => {
          const Icon = NOTIFICATION_ICONS[n.type];
          return (
            <li key={n.id} className={`flex flex-wrap items-start gap-3 py-3 sm:flex-nowrap ${n.unread ? "font-semibold" : ""}`}>
              <Icon aria-hidden className={`mt-0.5 size-5 shrink-0 ${NOTIFICATION_TONE[n.type] ?? "text-accent"}`} />
              <div className="min-w-0 flex-1">
                <p>
                  {n.unread ? <span className="sr-only">Unread: </span> : null}
                  {n.href ? (
                    <Link
                      href={n.href}
                      className="hover:underline"
                      onClick={() => {
                        if (n.unread) void markNotification({ id: n.id, read: true });
                      }}
                    >
                      {n.sentence}
                    </Link>
                  ) : (
                    n.sentence
                  )}
                </p>
                <p className="text-sm font-normal text-ink-muted">
                  <time dateTime={n.createdAt}>{n.when}</time> · {n.ago}
                </p>
              </div>
              {n.unread ? <span aria-hidden className="mt-2 size-2 shrink-0 rounded-full bg-accent" /> : null}
              <button
                type="button"
                onClick={() => toggle(n)}
                className="shrink-0 rounded px-2 py-1 font-heading text-sm font-semibold text-accent hover:underline"
                aria-label={`${n.unread ? "Mark read" : "Mark unread"}: ${n.sentence}`}
              >
                {n.unread ? "Mark read" : "Mark unread"}
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
