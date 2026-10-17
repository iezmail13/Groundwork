import { cookies } from "next/headers";
import type { Metadata } from "next";
import { Sidebar } from "@/components/shell/sidebar";
import { ClientCookies } from "@/components/shell/client-cookies";
import { TerminologyProvider } from "@/lib/terminology/context";
import { ViewerProvider } from "@/lib/viewer";
import { getOrgContext, initials, requireUser } from "@/lib/org";
import { getAttendancePrograms } from "@/lib/participants";
import { getMaintenance } from "@/lib/maintenance-request";
import { ScheduledMaintenanceBanner } from "@/components/maintenance/notices";
import { TopBar } from "@/components/shell/top-bar";
import { ThemeToggle } from "@/components/shell/theme-toggle";
import { getBranding } from "@/lib/branding";
import { UndoToastProvider } from "@/components/ui/undo-toast";
import { canManageOrg, rankOf } from "@/lib/roles";
import { NotificationBell } from "@/components/shell/notification-bell";
import { PresenceProvider } from "@/components/people/presence";
import { getUnreadCount, queueDueNotifications } from "@/lib/notifications";
import { ChatButton, ChatProvider } from "@/components/chat/chat";
import { getChatUnread } from "@/lib/chat";

export async function generateMetadata({ params }: LayoutProps<"/[orgSlug]">): Promise<Metadata> {
  const { orgSlug } = await params;
  const ctx = await getOrgContext(orgSlug);
  return { title: { default: ctx.org.name, template: `%s · ${ctx.org.name}` } };
}

export default async function OrgLayout({ children, params }: LayoutProps<"/[orgSlug]">) {
  const { orgSlug } = await params;
  const ctx = await getOrgContext(orgSlug);
  const { supabase } = await requireUser();
  // work due tomorrow or overdue becomes a notification when they next open the app (D103)
  await queueDueNotifications(ctx.org.id, ctx.today);

  const [{ data: memberships }, { data: profile }, { data: recent }, cookieStore, attendancePrograms, maintenance, branding] = await Promise.all([
    supabase
      .from("memberships")
      .select("organization:organizations(name, slug)")
      .eq("user_id", ctx.userId)
      .order("created_at"),
    supabase.from("profiles").select("full_name, email, presence_mode").eq("id", ctx.userId).maybeSingle(),
    supabase.rpc("recent_projects", { org_id: ctx.org.id, max_rows: 5 }),
    cookies(),
    getAttendancePrograms(ctx.org.id),
    getMaintenance(),
    getBranding(ctx.org, ctx.userId),
  ]);
  const [unread, chatUnread] = await Promise.all([getUnreadCount(ctx.org.id), getChatUnread(ctx)]);

  const orgs = (memberships ?? [])
    .map((m) => m.organization)
    .filter((o): o is { name: string; slug: string } => Boolean(o));
  const name = profile?.full_name || profile?.email || ctx.userEmail;

  const actions = (
    <>
      <ChatButton />
      <NotificationBell orgSlug={ctx.org.slug} initialUnread={unread} />
      <ThemeToggle initial={branding.themeMode} />
    </>
  );

  return (
    <div className="min-h-dvh bg-canvas text-ink" data-illustrations={branding.showIllustrations ? "on" : "off"}>
      {/* the org's or the viewer's accent, already contrast-checked for both modes (D84, D85) */}
      {branding.accentCss ? <style>{branding.accentCss}</style> : null}
      <TerminologyProvider labels={ctx.labels}>
      <ViewerProvider viewer={{ userId: ctx.userId, role: ctx.role, membershipId: ctx.membershipId }}>
      <PresenceProvider organizationId={ctx.org.id} userId={ctx.userId} mode={profile?.presence_mode ?? "auto"}>
      <ChatProvider orgSlug={ctx.org.slug} userId={ctx.userId} initialUnread={chatUnread}>
      <UndoToastProvider>
        <ClientCookies tz={ctx.tz} orgSlug={ctx.org.slug} themeMode={branding.themeMode} />
        <a
          href="#main"
          className="sr-only-focusable fixed top-2 left-2 z-[60] rounded-md bg-accent px-3 py-2 font-semibold text-on-accent"
        >
          Skip to content
        </a>
        <div className="flex min-h-dvh flex-col min-[900px]:flex-row">
          <Sidebar
            org={{ name: ctx.org.name, slug: ctx.org.slug }}
            logo={branding.logoUrl ? { url: branding.logoUrl, darkUrl: branding.logoDarkUrl } : null}
            mobileActions={
              <>
                <ChatButton onRail />
                <NotificationBell orgSlug={ctx.org.slug} initialUnread={unread} onRail />
                <ThemeToggle initial={branding.themeMode} onRail />
              </>
            }
            orgs={orgs}
            user={{ name, email: profile?.email ?? ctx.userEmail, initials: initials(name) }}
            recent={(recent ?? []).map((p) => ({ id: p.id, name: p.name }))}
            showAttendance={attendancePrograms.length > 0 || rankOf(ctx.role) >= rankOf("manager")}
            showFunds={canManageOrg(ctx.role)}
            initialCollapsed={cookieStore.get("sidebar")?.value === "collapsed"}
          />
          <div className="flex min-w-0 flex-1 flex-col">
            <TopBar actions={actions} notice={<ScheduledMaintenanceBanner setting={maintenance} timeZone={ctx.tz} />} />
            <main id="main" tabIndex={-1} className="min-w-0 flex-1 px-4 pt-6 pb-16 focus:outline-none sm:px-8 sm:pt-8">
              <div className="mx-auto max-w-[1400px]">{children}</div>
            </main>
          </div>
        </div>
      </UndoToastProvider>
      </ChatProvider>
      </PresenceProvider>
      </ViewerProvider>
      </TerminologyProvider>
    </div>
  );
}
