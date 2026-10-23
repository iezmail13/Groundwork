"use client";

import { useCallback, useState, useTransition } from "react";
import Link from "next/link";
import { History } from "lucide-react";
import { loadRecentActivity, type RecentActivityItem } from "@/app/[orgSlug]/activity/actions";
import { activityIcon } from "@/components/activity/activity-icons";
import { TopBarPanel } from "@/components/shell/top-bar-panel";

/**
 * Activity in the top bar, next to the bell (D110): the latest changes the
 * viewer can see, and a link to the full log with its filters and export.
 */
export function ActivityMenu({ orgSlug, onRail = false }: { orgSlug: string; onRail?: boolean }) {
  const [items, setItems] = useState<RecentActivityItem[] | null>(null);
  const [loading, startLoading] = useTransition();

  const refresh = useCallback(
    () =>
      startLoading(async () => {
        const result = await loadRecentActivity({ orgSlug });
        if (result.ok) setItems(result.items);
      }),
    [orgSlug],
  );

  return (
    <TopBarPanel
      label="Activity"
      icon={<History aria-hidden className="size-5" />}
      heading="Activity"
      onOpen={refresh}
      busy={loading}
      onRail={onRail}
      footer={(close) => (
        <Link href={`/${orgSlug}/activity`} onClick={close} className="font-heading text-sm font-semibold text-accent hover:underline">
          See all activity
        </Link>
      )}
    >
      {(close) =>
        items === null ? (
          <p className="px-4 py-6 text-sm text-ink-muted">Loading…</p>
        ) : items.length === 0 ? (
          <p className="px-4 py-6 text-sm text-ink-muted">No activity yet. Changes your team makes show up here.</p>
        ) : (
          <ul className="divide-y divide-rule">
            {items.map((a) => {
              const Icon = activityIcon(a.entityType);
              const body = (
                <>
                  <Icon aria-hidden className="mt-0.5 size-4 shrink-0 text-accent" />
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm">{a.sentence}</span>
                    {/* what it was about; branding changes are about the organization itself */}
                    {a.label && a.entityType !== "organization" ? (
                      <span className="block truncate text-sm font-semibold">{a.label}</span>
                    ) : null}
                    <time dateTime={a.at} className="block text-xs text-ink-muted">
                      {a.ago}
                    </time>
                  </span>
                </>
              );
              return (
                <li key={a.id}>
                  {a.href ? (
                    <Link href={a.href} onClick={close} className="flex items-start gap-3 px-4 py-3 hover:bg-panel">
                      {body}
                    </Link>
                  ) : (
                    <div className="flex items-start gap-3 px-4 py-3">{body}</div>
                  )}
                </li>
              );
            })}
          </ul>
        )
      }
    </TopBarPanel>
  );
}
