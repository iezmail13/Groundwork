import type { Metadata } from "next";
import Link from "next/link";
import { PageHeader } from "@/components/ui/page-header";
import { getOrgContext } from "@/lib/org";
import { getNotifications } from "@/lib/notifications";
import { formatTimestamp } from "@/lib/dates";
import { NotificationList } from "@/components/notifications/notification-list";

export const metadata: Metadata = { title: "Notifications" };

export default async function NotificationsPage({ params, searchParams }: PageProps<"/[orgSlug]/notifications">) {
  const { orgSlug } = await params;
  const sp = await searchParams;
  const ctx = await getOrgContext(orgSlug);
  const unreadOnly = sp.show === "unread";
  const items = await getNotifications(ctx.org.id, ctx.base, ctx.t, { limit: 200, unreadOnly });
  const tab = (value: "all" | "unread", label: string) => {
    const current = (value === "unread") === unreadOnly;
    return (
      <Link
        href={value === "unread" ? `${ctx.base}/notifications?show=unread` : `${ctx.base}/notifications`}
        aria-current={current ? "page" : undefined}
        className={`border-b-2 px-3 py-2 font-heading text-sm font-semibold ${current ? "border-accent text-ink" : "border-transparent text-ink-muted hover:text-ink"}`}
      >
        {label}
      </Link>
    );
  };
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Notifications"
        description={
          <>
            What&apos;s happened to your work, kept for you alone.{" "}
            <Link href={`${ctx.base}/settings?view=notifications`} className="font-semibold text-accent underline underline-offset-4">
              Choose what you&apos;re told about
            </Link>
            .
          </>
        }
      />
      <nav aria-label="Which notifications" className="flex gap-1 border-b border-rule">
        {tab("all", "All")}
        {tab("unread", "Unread")}
      </nav>
      <NotificationList
        orgSlug={ctx.org.slug}
        items={items.map((n) => ({ ...n, when: formatTimestamp(n.createdAt, ctx.tz) }))}
        emptyText={unreadOnly ? "You're all caught up." : "Nothing yet. You'll hear here when someone gives you work or something you care about changes."}
      />
    </div>
  );
}
