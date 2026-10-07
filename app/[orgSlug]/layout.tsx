import { cookies } from "next/headers";
import type { Metadata } from "next";
import { Sidebar } from "@/components/shell/sidebar";
import { ClientCookies } from "@/components/shell/client-cookies";
import { TerminologyProvider } from "@/lib/terminology/context";
import { getOrgContext, initials, requireUser } from "@/lib/org";
import { themeStyle } from "@/lib/theme/theme";

export async function generateMetadata({ params }: LayoutProps<"/[orgSlug]">): Promise<Metadata> {
  const { orgSlug } = await params;
  const ctx = await getOrgContext(orgSlug);
  return { title: { default: ctx.org.name, template: `%s · ${ctx.org.name}` } };
}

export default async function OrgLayout({ children, params }: LayoutProps<"/[orgSlug]">) {
  const { orgSlug } = await params;
  const ctx = await getOrgContext(orgSlug);
  const { supabase } = await requireUser();

  const [{ data: memberships }, { data: profile }, { data: recent }, cookieStore] = await Promise.all([
    supabase
      .from("memberships")
      .select("organization:organizations(name, slug)")
      .eq("user_id", ctx.userId)
      .order("created_at"),
    supabase.from("profiles").select("full_name, email").eq("id", ctx.userId).maybeSingle(),
    supabase.rpc("recent_projects", { org_id: ctx.org.id, max_rows: 5 }),
    cookies(),
  ]);

  const orgs = (memberships ?? [])
    .map((m) => m.organization)
    .filter((o): o is { name: string; slug: string } => Boolean(o));
  const name = profile?.full_name || profile?.email || ctx.userEmail;

  return (
    <div
      data-mode={ctx.theme.mode}
      style={themeStyle(ctx.tokens) as React.CSSProperties}
      className="min-h-dvh bg-canvas text-ink"
    >
      <TerminologyProvider labels={ctx.labels}>
        <ClientCookies tz={ctx.tz} orgSlug={ctx.org.slug} />
        <a
          href="#main"
          className="sr-only-focusable fixed top-2 left-2 z-[60] rounded-md bg-primary px-3 py-2 font-semibold text-on-primary"
        >
          Skip to content
        </a>
        <div className="flex min-h-dvh flex-col min-[900px]:flex-row">
          <Sidebar
            org={{ name: ctx.org.name, slug: ctx.org.slug }}
            orgs={orgs}
            user={{ name, email: profile?.email ?? ctx.userEmail, initials: initials(name) }}
            recent={(recent ?? []).map((p) => ({ id: p.id, name: p.name }))}
            initialCollapsed={cookieStore.get("sidebar")?.value === "collapsed"}
          />
          <main id="main" tabIndex={-1} className="min-w-0 flex-1 px-4 pt-6 pb-16 focus:outline-none sm:px-8 sm:pt-8">
            <div className="mx-auto max-w-[1400px]">{children}</div>
          </main>
        </div>
      </TerminologyProvider>
    </div>
  );
}
