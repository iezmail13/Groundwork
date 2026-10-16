"use client";

import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { createClient } from "@/lib/supabase/client";

// Online status (D104): Supabase Realtime Presence on the organization's
// private channel, which only its members can join. Each open tab announces
// online or away (no input for five minutes, or hidden), or Do not disturb.
// Appear offline announces nothing.

export type PresenceStatus = "online" | "away" | "dnd" | "offline";
export type PresenceMode = "auto" | "dnd" | "invisible";

const AWAY_AFTER_MS = 5 * 60 * 1000;
const RANK: Record<PresenceStatus, number> = { offline: 0, away: 1, online: 2, dnd: 3 };

const PresenceContext = createContext<Map<string, PresenceStatus>>(new Map());

type Shared = {
  key: string;
  channel: ReturnType<ReturnType<typeof createClient>["channel"]>;
  users: number;
  subscribed: boolean;
  own: PresenceStatus | null;
  latest: Map<string, PresenceStatus>;
  listeners: Set<(statuses: Map<string, PresenceStatus>) => void>;
  closing?: ReturnType<typeof setTimeout>;
};
let shared: Shared | null = null;

function track(link: Shared) {
  if (!link.subscribed) return;
  if (link.own) void link.channel.track({ status: link.own });
  else void link.channel.untrack();
}

function joinPresence(organizationId: string, userId: string) {
  const key = `${organizationId}:${userId}`;
  if (shared && shared.key !== key) {
    void createClient().removeChannel(shared.channel);
    shared = null;
  }
  if (!shared) {
    const supabase = createClient();
    const channel = supabase.channel(`org:${organizationId}:presence`, {
      config: { private: true, presence: { key: userId } },
    });
    const link: Shared = { key, channel, users: 0, subscribed: false, own: null, latest: new Map(), listeners: new Set() };
    channel.on("presence", { event: "sync" }, () => {
      const state = channel.presenceState<{ status: PresenceStatus }>();
      const next = new Map<string, PresenceStatus>();
      for (const [who, metas] of Object.entries(state)) {
        // several tabs: the most present one wins
        const best = metas.map((m) => m.status).sort((a, b) => RANK[b] - RANK[a])[0];
        if (best) next.set(who, best);
      }
      link.latest = next;
      for (const l of link.listeners) l(next);
    });
    void (async () => {
      await supabase.realtime.setAuth();
      channel.subscribe((status) => {
        link.subscribed = status === "SUBSCRIBED";
        // a rejoin starts with no presence: announce again
        if (link.subscribed) track(link);
      });
    })();
    shared = link;
  }
  const link = shared;
  if (link.closing) clearTimeout(link.closing);
  link.users += 1;
  return {
    listen(fn: (statuses: Map<string, PresenceStatus>) => void) {
      link.listeners.add(fn);
      fn(link.latest);
      return () => link.listeners.delete(fn);
    },
    release() {
      link.users -= 1;
      if (link.users > 0) return;
      // leave a moment later, so a remount picks the same channel back up
      link.closing = setTimeout(() => {
        if (shared === link && link.users === 0) {
          void createClient().removeChannel(link.channel);
          shared = null;
        }
      }, 1000);
    },
  };
}

function announce(organizationId: string, userId: string, own: PresenceStatus | null) {
  if (!shared || shared.key !== `${organizationId}:${userId}`) return;
  shared.own = own;
  track(shared);
}

export function PresenceProvider({
  organizationId,
  userId,
  mode,
  children,
}: {
  organizationId: string;
  userId: string;
  mode: PresenceMode;
  children: ReactNode;
}) {
  const [statuses, setStatuses] = useState<Map<string, PresenceStatus>>(new Map());
  const [idle, setIdle] = useState(false);

  // away after a while with no input, or while the tab is hidden
  useEffect(() => {
    let timer = window.setTimeout(() => setIdle(true), AWAY_AFTER_MS);
    const active = () => {
      window.clearTimeout(timer);
      setIdle(document.visibilityState === "hidden");
      timer = window.setTimeout(() => setIdle(true), AWAY_AFTER_MS);
    };
    const events = ["pointerdown", "keydown", "pointermove", "scroll", "visibilitychange"] as const;
    for (const e of events) window.addEventListener(e, active, { passive: true });
    return () => {
      window.clearTimeout(timer);
      for (const e of events) window.removeEventListener(e, active);
    };
  }, []);

  const own: PresenceStatus | null = mode === "invisible" ? null : mode === "dnd" ? "dnd" : idle ? "away" : "online";

  // one channel per organization, shared by every mount (React may mount twice in
  // development), and it announces the current status again after every rejoin
  useEffect(() => {
    const link = joinPresence(organizationId, userId);
    const unlisten = link.listen((next) => setStatuses(next));
    return () => {
      unlisten();
      link.release();
    };
  }, [organizationId, userId]);

  useEffect(() => {
    announce(organizationId, userId, own);
  }, [organizationId, userId, own]);

  const value = useMemo(() => {
    // your own status shows at once, before the channel confirms it
    const merged = new Map(statuses);
    if (own) merged.set(userId, own);
    else merged.delete(userId);
    return merged;
  }, [statuses, own, userId]);

  return <PresenceContext.Provider value={value}>{children}</PresenceContext.Provider>;
}

export function usePresence(userId: string | null | undefined): PresenceStatus {
  const map = useContext(PresenceContext);
  return (userId && map.get(userId)) || "offline";
}

const LABEL: Record<PresenceStatus, string> = {
  online: "Online",
  away: "Away",
  dnd: "Do not disturb",
  offline: "Offline",
};

/** A dot plus a word, so status never relies on colour alone. */
export function PresenceBadge({ userId, compact = false }: { userId: string | null | undefined; compact?: boolean }) {
  const status = usePresence(userId);
  const dot = {
    online: "bg-good border-good",
    away: "bg-warn border-warn",
    dnd: "bg-bad border-bad",
    offline: "bg-canvas border-ink-muted",
  }[status];
  return (
    <span className="inline-flex items-center gap-1.5 text-xs text-ink-muted" data-presence={status}>
      <span aria-hidden className={`inline-block size-2 shrink-0 rounded-full border ${dot}`} />
      <span className={compact ? "sr-only" : undefined}>{LABEL[status]}</span>
    </span>
  );
}
