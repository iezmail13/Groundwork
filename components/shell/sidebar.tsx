"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useId, useRef, useState, type ReactNode } from "react";
import {
  CalendarDays,
  Check,
  ClipboardCheck,
  PiggyBank,
  ChevronDown,
  ChevronsUpDown,
  FileText,
  FolderKanban,
  MessageSquareText,
  Receipt,
  FileChartColumn,
  LayoutDashboard,
  ListChecks,
  LogOut,
  Menu as MenuIcon,
  PanelLeftClose,
  PanelLeftOpen,
  Plus,
  Settings,
  Wallet,
  X,
  type LucideIcon,
} from "lucide-react";
import { Logo, Wordmark } from "@/components/logo";
import { Menu, menuItemClass } from "@/components/ui/menu";
import { useT } from "@/lib/terminology/context";
import { lower } from "@/lib/terminology/t";

export type ShellOrg = { name: string; slug: string };
/** An organization's uploaded logo (D86): signed links to it and its optional dark-mode version. */
export type OrgLogo = { url: string; darkUrl: string | null };
export type SidebarProgram = { id: string; name: string };

type Props = {
  org: ShellOrg;
  logo: OrgLogo | null;
  /** The viewer's controls (theme toggle), shown in the small-screen top bar. */
  mobileActions: ReactNode;
  orgs: ShellOrg[];
  user: { name: string; email: string; initials: string };
  /** The active programs the viewer can see, A to Z. */
  programs: SidebarProgram[];
  /** The viewer manages a participant roster somewhere (or could, as owner or manager). */
  showAttendance: boolean;
  /** Owners and managers see Funds. */
  showFunds: boolean;
  initialCollapsed: boolean;
};

const COOKIE = "sidebar";

export function Sidebar(props: Props) {
  const [collapsed, setCollapsed] = useState(props.initialCollapsed);
  const [mobileOpen, setMobileOpen] = useState(false);
  const menuButtonRef = useRef<HTMLButtonElement>(null);
  const pathname = usePathname();

  // close the slide-over after navigating
  const [lastPath, setLastPath] = useState(pathname);
  if (pathname !== lastPath) {
    setLastPath(pathname);
    setMobileOpen(false);
  }

  const toggle = () => {
    const next = !collapsed;
    setCollapsed(next);
    document.cookie = `${COOKIE}=${next ? "collapsed" : "expanded"}; path=/; max-age=31536000; samesite=lax`;
  };

  const closeMobile = useCallback(() => {
    setMobileOpen(false);
    menuButtonRef.current?.focus();
  }, []);

  return (
    <>
      {/* Small screens: top bar with a menu button that opens a slide-over */}
      <div className="on-rail sticky top-0 z-30 flex items-center gap-3 bg-rail px-3 py-2 text-rail-ink min-[900px]:hidden print:hidden">
        <button
          ref={menuButtonRef}
          type="button"
          onClick={() => setMobileOpen(true)}
          className="inline-flex size-10 items-center justify-center rounded-md hover:bg-rail-hover"
          aria-label="Open navigation"
          aria-expanded={mobileOpen}
          aria-controls="mobile-nav"
        >
          <MenuIcon aria-hidden className="size-5" />
        </button>
        <HomeLink org={props.org} logo={props.logo} collapsed={false} />
        <div className="ml-auto flex items-center">{props.mobileActions}</div>
      </div>

      {mobileOpen ? (
        <SlideOver onClose={closeMobile}>
          <SidebarBody {...props} collapsed={false} pathname={pathname} onClose={closeMobile} />
        </SlideOver>
      ) : null}

      {/* Wide screens: persistent rail, expanded (260px) or collapsed (64px) */}
      <aside
        className={`on-rail sticky top-0 hidden h-dvh shrink-0 flex-col bg-rail text-rail-ink transition-[width] duration-200 min-[900px]:flex print:hidden ${
          collapsed ? "w-16" : "w-[260px]"
        }`}
        aria-label="Sidebar"
      >
        <SidebarBody {...props} collapsed={collapsed} pathname={pathname} onToggle={toggle} />
      </aside>
    </>
  );
}

function HomeLink({ org, logo, collapsed }: { org: ShellOrg; logo: OrgLogo | null; collapsed: boolean }) {
  const href = `/${org.slug}/dashboard`;
  if (logo) {
    // the rail is dark in both modes (navy, or a deep accent, D110): the dark version if there is one, else the logo on a light backing
    return (
      <Link href={href} className="flex min-w-0 items-center rounded-md" aria-label={`${org.name} home`}>
        <span
          className={`inline-flex items-center justify-center overflow-hidden rounded-md ${logo.darkUrl ? "" : "bg-white p-1"} ${
            collapsed ? "size-10" : "h-10 max-w-[180px]"
          }`}
        >
          {/* eslint-disable-next-line @next/next/no-img-element -- a signed storage link, not a static asset */}
          <img src={logo.darkUrl ?? logo.url} alt="" className="h-full w-auto max-w-full object-contain" />
        </span>
      </Link>
    );
  }
  return (
    <Link href={href} className="logo-link flex min-w-0 items-center gap-2" aria-label="Groundwork home">
      <Logo size={52} dark />
      {collapsed ? null : <Wordmark dark height={22} />}
    </Link>
  );
}

/** Stays at the foot of the sidebar when an organization's logo replaces Groundwork's (D86). */
function PoweredBy({ collapsed }: { collapsed: boolean }) {
  return (
    <p
      className={`flex items-center gap-1.5 px-3 pt-2 text-xs text-rail-ink-muted ${collapsed ? "justify-center px-0" : ""}`}
      title={collapsed ? "Powered by Groundwork" : undefined}
    >
      <Logo size={22} dark />
      {collapsed ? <span className="sr-only">Powered by Groundwork</span> : <span>Powered by Groundwork</span>}
    </p>
  );
}

function SidebarBody({
  org,
  logo,
  orgs,
  user,
  programs,
  showAttendance,
  showFunds,
  collapsed,
  pathname,
  onToggle,
  onClose,
}: Props & { collapsed: boolean; pathname: string; onToggle?: () => void; onClose?: () => void }) {
  const t = useT();
  const base = `/${org.slug}`;
  // Activity lives in the top bar (D110); Funds and Spending sit under Finances
  const nav: NavEntry[] = [
    { href: `${base}/dashboard`, label: t("section.dashboard"), icon: LayoutDashboard },
    // with two or more programs, Programs opens to list them (D111)
    programs.length > 1
      ? {
          label: t("project", "other"),
          icon: FolderKanban,
          href: `${base}/projects`,
          items: [
            { href: `${base}/projects`, label: `All ${lower(t("project", "other"))}`, exact: true },
            ...programs.map((p) => ({ href: `${base}/projects/${p.id}`, label: p.name })),
          ],
        }
      : { href: `${base}/projects`, label: t("project", "other"), icon: FolderKanban },
    { href: `${base}/tasks`, label: t("task", "other"), icon: ListChecks },
    { href: `${base}/calendar`, label: t("section.calendar"), icon: CalendarDays },
    { href: `${base}/documents`, label: t("document", "other"), icon: FileText },
    { href: `${base}/discussions`, label: "Discussions", icon: MessageSquareText },
    ...(showAttendance ? [{ href: `${base}/attendance`, label: t("section.attendance"), icon: ClipboardCheck }] : []),
    {
      label: "Finances",
      icon: Wallet,
      items: [
        ...(showFunds ? [{ href: `${base}/funds`, label: t("section.funds"), icon: PiggyBank }] : []),
        { href: `${base}/spending`, label: "Spending", icon: Receipt },
      ],
    },
    { href: `${base}/reports`, label: "Reports", icon: FileChartColumn },
  ];
  const isActive = (href: string, exact = false) => pathname === href || (!exact && pathname.startsWith(`${href}/`));

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className={`flex items-center gap-2 px-3 pt-3 pb-4 ${collapsed ? "flex-col" : "justify-between"}`}>
        <HomeLink org={org} logo={logo} collapsed={collapsed} />
        {onToggle ? (
          <button
            type="button"
            onClick={onToggle}
            className="inline-flex size-9 shrink-0 items-center justify-center rounded-md text-rail-ink-muted hover:bg-rail-hover hover:text-rail-ink"
            aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            aria-expanded={!collapsed}
            title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          >
            {collapsed ? <PanelLeftOpen aria-hidden className="size-5" /> : <PanelLeftClose aria-hidden className="size-5" />}
          </button>
        ) : null}
        {onClose ? (
          <button
            type="button"
            onClick={onClose}
            className="inline-flex size-9 items-center justify-center rounded-md hover:bg-rail-hover"
            aria-label="Close navigation"
          >
            <X aria-hidden className="size-5" />
          </button>
        ) : null}
      </div>

      <nav aria-label="Main" className="min-h-0 flex-1 overflow-y-auto px-2 pb-2">
        <ul className="flex flex-col gap-0.5">
          {nav.map((entry) =>
            "items" in entry ? (
              // the narrow rail has no room for a heading: it shows the group's own page, or its pages as icons
              collapsed ? (
                entry.href ? (
                  <li key={entry.href}>
                    <NavLink href={entry.href} label={entry.label} active={isActive(entry.href)} collapsed>
                      <entry.icon aria-hidden className="size-5 shrink-0" />
                    </NavLink>
                  </li>
                ) : (
                  entry.items.map((item) => (
                    <li key={item.href}>
                      <NavLink href={item.href} label={item.label} active={isActive(item.href, item.exact)} collapsed>
                        <NavIcon icon={item.icon} />
                      </NavLink>
                    </li>
                  ))
                )
              ) : (
                <li key={entry.label}>
                  <NavGroup group={entry} isActive={isActive} />
                </li>
              )
            ) : (
              <li key={entry.href}>
                <NavLink href={entry.href} label={entry.label} active={isActive(entry.href)} collapsed={collapsed}>
                  <entry.icon aria-hidden className="size-5 shrink-0" />
                </NavLink>
              </li>
            ),
          )}
        </ul>
      </nav>

      <div className="mt-2 flex flex-col gap-0.5 border-t border-rail-hover px-2 pt-2 pb-3">
        <NavLink
          href={`${base}/settings`}
          label={t("section.settings")}
          active={isActive(`${base}/settings`)}
          collapsed={collapsed}
        >
          <Settings aria-hidden className="size-5 shrink-0" />
        </NavLink>

        <Menu
          buttonLabel={`Organization: ${org.name}. Switch organization`}
          buttonClassName={`flex w-full items-center gap-2.5 rounded-md px-3 py-2 text-left hover:bg-rail-hover ${collapsed ? "justify-center px-0" : ""}`}
          button={
            <>
              <span className="inline-flex size-6 shrink-0 items-center justify-center rounded bg-rail-active font-heading text-xs font-bold text-rail-active-ink">
                {org.name.slice(0, 1).toUpperCase()}
              </span>
              {collapsed ? null : (
                <>
                  <span className="min-w-0 flex-1 truncate text-sm font-semibold">{org.name}</span>
                  <ChevronsUpDown aria-hidden className="size-4 shrink-0 text-rail-ink-muted" />
                </>
              )}
            </>
          }
        >
          {(close) => (
            <>
              <p className="px-3 pt-1.5 pb-1 font-heading text-xs font-bold tracking-wider text-ink-muted uppercase">
                Organizations
              </p>
              {orgs.map((o) => (
                <Link
                  key={o.slug}
                  role="menuitem"
                  href={`/${o.slug}/dashboard`}
                  className={menuItemClass}
                  aria-current={o.slug === org.slug ? "true" : undefined}
                  onClick={close}
                >
                  <span className="min-w-0 flex-1 truncate">{o.name}</span>
                  {o.slug === org.slug ? (
                    <>
                      <Check aria-hidden className="size-4" />
                      <span className="sr-only">(current)</span>
                    </>
                  ) : null}
                </Link>
              ))}
              <div className="my-1 border-t border-rule" />
              <Link role="menuitem" href="/create-organization" className={menuItemClass} onClick={close}>
                <Plus aria-hidden className="size-4" />
                Create organization
              </Link>
            </>
          )}
        </Menu>

        <Menu
          buttonLabel={`Account: ${user.name}`}
          buttonClassName={`flex w-full items-center gap-2.5 rounded-md px-3 py-2 text-left hover:bg-rail-hover ${collapsed ? "justify-center px-0" : ""}`}
          button={
            <>
              <span className="inline-flex size-6 shrink-0 items-center justify-center rounded-full border border-rail-ink font-heading text-[0.65rem] font-bold">
                {user.initials}
              </span>
              {collapsed ? null : <span className="min-w-0 flex-1 truncate text-sm">{user.name}</span>}
            </>
          }
        >
          {() => (
            <>
              <div className="px-3 py-2">
                <p className="truncate text-sm font-semibold">{user.name}</p>
                <p className="truncate text-sm text-ink-muted">{user.email}</p>
              </div>
              <div className="my-1 border-t border-rule" />
              <form action="/auth/signout" method="post">
                <button type="submit" role="menuitem" className={menuItemClass}>
                  <LogOut aria-hidden className="size-4" />
                  Sign out
                </button>
              </form>
            </>
          )}
        </Menu>
        {logo ? <PoweredBy collapsed={collapsed} /> : null}
      </div>
    </div>
  );
}

type NavItem = { href: string; label: string; icon: LucideIcon };
/** A page under a heading: an icon is optional, and `exact` keeps an overview page from matching the pages under it. */
type SubItem = { href: string; label: string; icon?: LucideIcon; exact?: boolean };
type NavGroupEntry = { label: string; icon: LucideIcon; href?: string; items: SubItem[] };
type NavEntry = NavItem | NavGroupEntry;

/** A sub-item's icon, or a small dot for pages that are just names (like each program). */
function NavIcon({ icon: Icon }: { icon?: LucideIcon }) {
  return Icon ? (
    <Icon aria-hidden className="size-5 shrink-0" />
  ) : (
    <span aria-hidden className="inline-flex size-5 shrink-0 items-center justify-center">
      <span className="size-1.5 rounded-full bg-current" />
    </span>
  );
}

/**
 * A heading that opens and closes its pages: Finances (D110), and Programs
 * once there are two or more (D111). It opens by itself on one of its pages.
 */
function NavGroup({
  group,
  isActive,
}: {
  group: NavGroupEntry;
  isActive: (href: string, exact?: boolean) => boolean;
}) {
  const listId = useId();
  const current = group.items.some((item) => isActive(item.href, item.exact));
  const [open, setOpen] = useState(current);
  // arriving on one of its pages opens it
  const [wasCurrent, setWasCurrent] = useState(current);
  if (current !== wasCurrent) {
    setWasCurrent(current);
    if (current) setOpen(true);
  }
  const Icon = group.icon;
  return (
    <>
      <button
        type="button"
        aria-expanded={open}
        aria-controls={listId}
        onClick={() => setOpen(!open)}
        className={`flex w-full items-center gap-3 rounded-md px-3 py-2 text-left font-heading text-[0.95rem] font-semibold transition-colors hover:bg-rail-hover ${
          current && !open ? "bg-rail-hover" : ""
        }`}
      >
        <span className={`inline-flex ${current ? "text-rail-ink" : "text-rail-ink-muted"}`}>
          <Icon aria-hidden className="size-5 shrink-0" />
        </span>
        <span className="min-w-0 flex-1 truncate">{group.label}</span>
        <ChevronDown aria-hidden className={`size-4 shrink-0 text-rail-ink-muted transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      <ul id={listId} hidden={!open} className="mt-0.5 flex flex-col gap-0.5 pl-5">
        {group.items.map((item) => (
          <li key={item.href}>
            <NavLink href={item.href} label={item.label} active={isActive(item.href, item.exact)} collapsed={false}>
              <NavIcon icon={item.icon} />
            </NavLink>
          </li>
        ))}
      </ul>
    </>
  );
}

function NavLink({
  href,
  label,
  active,
  collapsed,
  children,
}: {
  href: string;
  label: string;
  active: boolean;
  collapsed: boolean;
  children: ReactNode;
}) {
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      aria-label={collapsed ? label : undefined}
      title={collapsed ? label : undefined}
      className={`flex items-center gap-3 rounded-md px-3 py-2 font-heading text-[0.95rem] font-semibold transition-colors ${
        collapsed ? "justify-center px-0" : ""
      } ${active ? "bg-rail-active text-rail-active-ink" : "text-rail-ink hover:bg-rail-hover"}`}
    >
      {/* the current item's icon takes the accent (D83) */}
      <span className={`inline-flex ${active ? "text-accent" : "text-rail-ink-muted"}`}>{children}</span>
      {collapsed ? null : <span className="truncate">{label}</span>}
    </Link>
  );
}

/** Modal slide-over with a focus trap; Escape or the backdrop closes it. */
function SlideOver({ onClose, children }: { onClose: () => void; children: ReactNode }) {
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const panel = panelRef.current;
    if (!panel) return;
    const focusables = () =>
      Array.from(
        panel.querySelectorAll<HTMLElement>('a[href], button:not([disabled]), input, select, textarea, [tabindex]:not([tabindex="-1"])'),
      );
    focusables()[0]?.focus();
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
        return;
      }
      if (e.key !== "Tab") return;
      const list = focusables();
      if (list.length === 0) return;
      const first = list[0]!;
      const last = list[list.length - 1]!;
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = previousOverflow;
    };
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 min-[900px]:hidden">
      <div className="absolute inset-0 bg-scrim/55" aria-hidden onClick={onClose} />
      <div
        ref={panelRef}
        id="mobile-nav"
        role="dialog"
        aria-modal="true"
        aria-label="Navigation"
        className="on-rail slide-over-panel absolute inset-y-0 left-0 flex w-[280px] max-w-[85vw] flex-col bg-rail text-rail-ink"
      >
        {children}
      </div>
    </div>
  );
}
