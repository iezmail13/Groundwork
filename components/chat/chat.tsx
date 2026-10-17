"use client";

import {
  createContext,
  Suspense,
  useCallback,
  useContext,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  useTransition,
  type ReactNode,
} from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { ArrowLeft, Bell, BellOff, MessagesSquare, Pencil, Plus, Send, Trash2, Users, X } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useT } from "@/lib/terminology/context";
import { Avatar } from "@/components/people/avatar";
import { PresenceBadge } from "@/components/people/presence";
import { fromTokens, MAX_MESSAGE_LENGTH, mentionAt, splitMentions, toTokens, type Picked } from "@/lib/chat-text";
import type { ChatChannel, ChatMessage, ChatPerson } from "@/lib/chat";
import {
  chatUnread,
  deleteMessage,
  editMessage,
  loadChat,
  loadConversation,
  openDirect,
  sendMessage,
  setChannelMuted,
} from "@/app/[orgSlug]/chat/actions";

// Chat (D106): a side panel over the current page, opened from the top bar.
// Conversations refresh live: the database signals a private Realtime topic
// per conversation and per person; typing is a broadcast, not Presence.

const WIDTH_KEY = "groundwork:chat-width";
const MIN_WIDTH = 340;
const DEFAULT_WIDTH = 420;
const TYPING_CLEARS_MS = 4000;

type ChatApi = {
  unread: number;
  isOpen: boolean;
  open: (channelId?: string) => void;
  openDirectWith: (userId: string) => void;
  close: () => void;
};

const ChatContext = createContext<ChatApi | null>(null);

export function useChat(): ChatApi {
  const ctx = useContext(ChatContext);
  if (!ctx) throw new Error("useChat needs a ChatProvider");
  return ctx;
}

function readWidth(): number {
  try {
    const n = Number(window.localStorage.getItem(WIDTH_KEY));
    return Number.isFinite(n) && n >= MIN_WIDTH ? n : DEFAULT_WIDTH;
  } catch {
    return DEFAULT_WIDTH;
  }
}

function saveWidth(n: number) {
  try {
    window.localStorage.setItem(WIDTH_KEY, String(Math.round(n)));
  } catch {
    // private windows may refuse storage; the default width still works
  }
}

/** Subscribes to private broadcast topics and calls back on each event. */
function useBroadcast(topics: string[], onEvent: (topic: string, event: string, payload: Record<string, unknown>) => void) {
  const handler = useRef(onEvent);
  useEffect(() => {
    handler.current = onEvent;
  });
  const key = topics.join("|");
  useEffect(() => {
    if (!key) return;
    const supabase = createClient();
    const channels = key.split("|").map((topic) => {
      const ch = supabase.channel(topic, { config: { private: true } });
      ch.on("broadcast", { event: "*" }, (msg) => handler.current(topic, msg.event, (msg.payload ?? {}) as Record<string, unknown>));
      return ch;
    });
    let cancelled = false;
    void (async () => {
      await supabase.realtime.setAuth();
      if (cancelled) return;
      for (const ch of channels) ch.subscribe();
    })();
    return () => {
      cancelled = true;
      for (const ch of channels) void supabase.removeChannel(ch);
    };
  }, [key]);
}

export function ChatProvider({
  orgSlug,
  userId,
  initialUnread,
  children,
}: {
  orgSlug: string;
  userId: string;
  initialUnread: number;
  children: ReactNode;
}) {
  const [isOpen, setOpen] = useState(false);
  const [channelId, setChannelId] = useState<string | null>(null);
  const [unread, setUnread] = useState(initialUnread);
  const [version, setVersion] = useState(0);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const refreshUnread = useCallback(async () => {
    const n = await chatUnread({ orgSlug });
    if (n !== null) setUnread(n);
  }, [orgSlug]);

  // news in any of my conversations: refresh the count (and the open panel)
  useBroadcast([`user:${userId}:chat`], () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      void refreshUnread();
      setVersion((v) => v + 1);
    }, 300);
  });

  const api = useMemo<ChatApi>(
    () => ({
      unread,
      isOpen,
      open: (id) => {
        setChannelId(id ?? null);
        setOpen(true);
      },
      openDirectWith: (other) => {
        void (async () => {
          const result = await openDirect({ orgSlug, userId: other });
          if (result.ok) {
            setChannelId(result.channelId);
            setOpen(true);
          }
        })();
      },
      close: () => setOpen(false),
    }),
    [unread, isOpen, orgSlug],
  );

  return (
    <ChatContext.Provider value={api}>
      {children}
      <Suspense fallback={null}>
        <OpenFromUrl onOpen={api.open} />
      </Suspense>
      {isOpen ? (
        <ChatPanel
          orgSlug={orgSlug}
          channelId={channelId}
          onChannel={setChannelId}
          onClose={() => setOpen(false)}
          onRead={refreshUnread}
          version={version}
        />
      ) : null}
    </ChatContext.Provider>
  );
}

/** A notification links to ?chat=<conversation>: open it, then tidy the address. */
function OpenFromUrl({ onOpen }: { onOpen: (channelId?: string) => void }) {
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const target = params.get("chat");
  useEffect(() => {
    if (!target) return;
    onOpen(/^[0-9a-f-]{36}$/.test(target) ? target : undefined);
    const rest = new URLSearchParams(params.toString());
    rest.delete("chat");
    router.replace(rest.size ? `${pathname}?${rest}` : pathname, { scroll: false });
  }, [target, onOpen, params, pathname, router]);
  return null;
}

export function ChatButton({ onRail = false }: { onRail?: boolean }) {
  const chat = useChat();
  const label = chat.unread ? `Chat, ${chat.unread} unread` : "Chat";
  return (
    <button
      type="button"
      aria-label={label}
      aria-expanded={chat.isOpen}
      onClick={() => (chat.isOpen ? chat.close() : chat.open())}
      className={`relative inline-flex size-9 items-center justify-center rounded-md border border-transparent ${
        onRail ? "hover:bg-rail-hover" : "text-ink hover:border-rule hover:bg-panel"
      }`}
    >
      <MessagesSquare aria-hidden className="size-5" />
      {chat.unread > 0 ? (
        <span
          aria-hidden
          className="absolute -top-1 -right-1 inline-flex min-w-5 items-center justify-center rounded-full border-2 border-canvas bg-accent px-1 font-heading text-[11px] leading-4 font-bold text-on-accent"
        >
          {chat.unread > 99 ? "99+" : chat.unread}
        </span>
      ) : null}
    </button>
  );
}

function ChatPanel({
  orgSlug,
  channelId,
  onChannel,
  onClose,
  onRead,
  version,
}: {
  orgSlug: string;
  channelId: string | null;
  onChannel: (id: string | null) => void;
  onClose: () => void;
  onRead: () => void;
  version: number;
}) {
  // the panel only renders after a click, so the stored width is there to read
  const [width, setWidth] = useState(() => (typeof window === "undefined" ? DEFAULT_WIDTH : readWidth()));
  const [overview, setOverview] = useState<Extract<Awaited<ReturnType<typeof loadChat>>, { ok: true }> | null>(null);
  const headingId = useId();
  const panelRef = useRef<HTMLDivElement>(null);
  const opener = useRef<Element | null>(null);

  useEffect(() => {
    opener.current = document.activeElement;
    const back = opener.current;
    return () => {
      if (back instanceof HTMLElement) back.focus();
    };
  }, []);

  const reload = useCallback(
    () =>
      loadChat({ orgSlug }).then((data) => {
        if (data.ok) setOverview(data);
      }),
    [orgSlug],
  );

  useEffect(() => {
    let alive = true;
    void loadChat({ orgSlug }).then((data) => {
      if (alive && data.ok) setOverview(data);
    });
    return () => {
      alive = false;
    };
  }, [orgSlug, version]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !(e.target instanceof HTMLTextAreaElement && e.target.value)) onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  const max = () => Math.max(MIN_WIDTH, Math.round(window.innerWidth / 2));
  const resizeTo = (n: number) => {
    const next = Math.min(max(), Math.max(MIN_WIDTH, n));
    setWidth(next);
    saveWidth(next);
  };
  const startDrag = (e: React.PointerEvent) => {
    e.preventDefault();
    const move = (ev: PointerEvent) => resizeTo(window.innerWidth - ev.clientX);
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  };

  const channel = overview?.channels.find((c) => c.id === channelId) ?? null;

  return (
    <div
      ref={panelRef}
      role="dialog"
      aria-labelledby={headingId}
      data-chat-panel
      style={{ "--chat-w": `${width}px` } as React.CSSProperties}
      className="fixed inset-0 z-50 flex bg-canvas text-ink min-[900px]:inset-y-0 min-[900px]:right-0 min-[900px]:left-auto min-[900px]:w-(--chat-w) min-[900px]:border-l min-[900px]:border-rule"
    >
      <div
        role="separator"
        aria-orientation="vertical"
        aria-label="Resize chat"
        aria-valuemin={MIN_WIDTH}
        aria-valuemax={typeof window === "undefined" ? 960 : max()}
        aria-valuenow={width}
        tabIndex={0}
        onPointerDown={startDrag}
        onKeyDown={(e) => {
          if (e.key === "ArrowLeft") resizeTo(width + 32);
          if (e.key === "ArrowRight") resizeTo(width - 32);
          if (e.key === "Home") resizeTo(DEFAULT_WIDTH);
        }}
        className="hidden w-1.5 shrink-0 cursor-col-resize border-r border-rule hover:bg-accent focus-visible:bg-accent focus-visible:outline-none min-[900px]:block"
      />
      <div className="flex min-w-0 flex-1 flex-col">
        {channelId && overview ? (
          channel ? (
            <Conversation
              key={channel.id}
              orgSlug={orgSlug}
              channel={channel}
              me={overview.me}
              people={overview.people}
              headingId={headingId}
              onBack={() => onChannel(null)}
              onClose={onClose}
              onChanged={() => {
                void reload();
                onRead();
              }}
              version={version}
            />
          ) : (
            <PanelMessage headingId={headingId} onClose={onClose} onBack={() => onChannel(null)}>
              You can&apos;t see that conversation any more.
            </PanelMessage>
          )
        ) : (
          <ChannelList
            orgSlug={orgSlug}
            overview={overview}
            headingId={headingId}
            onPick={onChannel}
            onClose={onClose}
          />
        )}
      </div>
    </div>
  );
}

function PanelHeader({
  headingId,
  title,
  onBack,
  onClose,
  children,
}: {
  headingId: string;
  title: ReactNode;
  onBack?: () => void;
  onClose: () => void;
  children?: ReactNode;
}) {
  return (
    <div className="flex items-center gap-2 border-b border-rule px-3 py-2.5">
      {onBack ? (
        <button type="button" onClick={onBack} aria-label="All conversations" className="inline-flex size-8 items-center justify-center rounded hover:bg-panel">
          <ArrowLeft aria-hidden className="size-4" />
        </button>
      ) : null}
      <h2 id={headingId} tabIndex={-1} data-autofocus className="min-w-0 flex-1 truncate font-heading text-base font-bold focus:outline-none">
        {title}
      </h2>
      {children}
      <button type="button" aria-label="Close chat" onClick={onClose} className="inline-flex size-8 items-center justify-center rounded hover:bg-panel">
        <X aria-hidden className="size-4" />
      </button>
    </div>
  );
}

function PanelMessage({ headingId, onBack, onClose, children }: { headingId: string; onBack: () => void; onClose: () => void; children: ReactNode }) {
  return (
    <>
      <PanelHeader headingId={headingId} title="Chat" onBack={onBack} onClose={onClose} />
      <p className="px-4 py-6 text-sm text-ink-muted">{children}</p>
    </>
  );
}

function UnreadBadge({ n, muted }: { n: number; muted: boolean }) {
  if (n === 0) return null;
  return (
    <span
      className={`inline-flex min-w-5 items-center justify-center rounded-full px-1.5 font-heading text-xs font-bold ${
        muted ? "border border-ink-muted text-ink-muted" : "bg-accent text-on-accent"
      }`}
    >
      {n}
      <span className="sr-only"> unread</span>
    </span>
  );
}

function ChannelList({
  orgSlug,
  overview,
  headingId,
  onPick,
  onClose,
}: {
  orgSlug: string;
  overview: Extract<Awaited<ReturnType<typeof loadChat>>, { ok: true }> | null;
  headingId: string;
  onPick: (id: string) => void;
  onClose: () => void;
}) {
  const t = useT();
  const [picking, setPicking] = useState(false);
  const [query, setQuery] = useState("");
  const [pending, start] = useTransition();
  const headingRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    headingRef.current?.querySelector<HTMLElement>("[data-autofocus]")?.focus();
  }, []);

  const groups = useMemo(() => {
    const list = overview?.channels ?? [];
    return [
      { key: "org", label: "Everyone", items: list.filter((c) => c.kind === "org") },
      { key: "project", label: t("project", "other"), items: list.filter((c) => c.kind === "project") },
      { key: "direct", label: "Direct messages", items: list.filter((c) => c.kind === "direct") },
    ];
  }, [overview, t]);

  const others = useMemo(
    () =>
      Object.values(overview?.people ?? {})
        .filter((p) => p.userId !== overview?.me && p.name.toLowerCase().includes(query.trim().toLowerCase()))
        .sort((a, b) => a.name.localeCompare(b.name)),
    [overview, query],
  );

  const startDirect = (userId: string) =>
    start(async () => {
      const result = await openDirect({ orgSlug, userId });
      if (result.ok) onPick(result.channelId);
    });

  return (
    <div ref={headingRef} className="flex min-h-0 flex-1 flex-col">
      <PanelHeader headingId={headingId} title="Chat" onClose={onClose} />
      <div className="min-h-0 flex-1 overflow-y-auto" aria-busy={overview === null || pending}>
        {overview === null ? <p className="px-4 py-6 text-sm text-ink-muted">Loading…</p> : null}
        {overview
          ? groups.map((g) => (
              <section key={g.key} aria-labelledby={`chat-${g.key}`} className="border-b border-rule py-2">
                <div className="flex items-center justify-between px-4 py-1">
                  <h3 id={`chat-${g.key}`} className="font-heading text-xs font-bold tracking-wide text-ink-muted uppercase">
                    {g.label}
                  </h3>
                  {g.key === "direct" ? (
                    <button
                      type="button"
                      onClick={() => setPicking((v) => !v)}
                      aria-expanded={picking}
                      className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 font-heading text-xs font-semibold text-accent hover:underline"
                    >
                      <Plus aria-hidden className="size-3.5" />
                      New message
                    </button>
                  ) : null}
                </div>
                {g.key === "direct" && picking ? (
                  <div className="px-4 pb-2">
                    <label htmlFor="chat-person-search" className="sr-only">
                      Find someone to message
                    </label>
                    <input
                      id="chat-person-search"
                      autoFocus
                      value={query}
                      onChange={(e) => setQuery(e.target.value)}
                      placeholder="Find someone…"
                      className="w-full rounded-md border border-rule bg-canvas px-2.5 py-1.5 text-sm"
                    />
                    <ul className="mt-1 max-h-48 overflow-y-auto">
                      {others.map((p) => (
                        <li key={p.userId}>
                          <button
                            type="button"
                            onClick={() => startDirect(p.userId)}
                            className="flex w-full items-center gap-2 rounded px-1.5 py-1.5 text-left text-sm hover:bg-panel"
                          >
                            <Avatar name={p.name} initials={p.initials} photoUrl={p.photoUrl} size="xs" />
                            <span className="min-w-0 flex-1 truncate">{p.name}</span>
                            <PresenceBadge userId={p.userId} compact />
                          </button>
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}
                {g.items.length === 0 ? (
                  <p className="px-4 py-1 text-sm text-ink-muted">
                    {g.key === "direct" ? "No direct messages yet." : `You're not on any ${t("project", "other").toLowerCase()} yet.`}
                  </p>
                ) : (
                  <ul>
                    {g.items.map((c) => (
                      <li key={c.id}>
                        <ChannelRow channel={c} people={overview.people} onPick={() => onPick(c.id)} />
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            ))
          : null}
      </div>
    </div>
  );
}

function ChannelRow({ channel, people, onPick }: { channel: ChatChannel; people: Record<string, ChatPerson>; onPick: () => void }) {
  const other = channel.otherUserId ? people[channel.otherUserId] : undefined;
  return (
    <button
      type="button"
      onClick={onPick}
      data-channel={channel.kind}
      className={`flex w-full items-center gap-2 px-4 py-2 text-left hover:bg-panel ${channel.unread ? "font-semibold" : ""}`}
    >
      {channel.kind === "direct" ? (
        <Avatar name={channel.title} initials={other?.initials ?? "?"} photoUrl={other?.photoUrl ?? null} size="xs" />
      ) : (
        <span aria-hidden className="inline-flex size-6 items-center justify-center rounded-md border border-rule font-heading text-xs font-bold">
          #
        </span>
      )}
      <span className="min-w-0 flex-1 truncate text-sm">{channel.title}</span>
      {channel.kind === "direct" ? <PresenceBadge userId={channel.otherUserId} compact /> : null}
      {channel.muted ? (
        <span className="inline-flex items-center text-ink-muted">
          <BellOff aria-hidden className="size-3.5" />
          <span className="sr-only">Muted</span>
        </span>
      ) : null}
      <UnreadBadge n={channel.unread} muted={channel.muted} />
    </button>
  );
}

export function MessageBody({ body, people }: { body: string; people: Record<string, ChatPerson> }) {
  return (
    <p className="text-sm break-words whitespace-pre-wrap">
      {splitMentions(body).map((s, i) =>
        s.kind === "text" ? (
          <span key={i}>{s.text}</span>
        ) : people[s.userId] ? (
          <Link key={i} href={people[s.userId]!.href} className="rounded bg-accent-tint px-0.5 font-semibold text-accent hover:underline">
            @{people[s.userId]!.name}
          </Link>
        ) : (
          <span key={i} className="font-semibold">
            @someone
          </span>
        ),
      )}
    </p>
  );
}

function Conversation({
  orgSlug,
  channel,
  me,
  people,
  headingId,
  onBack,
  onClose,
  onChanged,
  version,
}: {
  orgSlug: string;
  channel: ChatChannel;
  me: string;
  people: Record<string, ChatPerson>;
  headingId: string;
  onBack: () => void;
  onClose: () => void;
  onChanged: () => void;
  version: number;
}) {
  const [data, setData] = useState<{ messages: ChatMessage[]; mentionable: string[]; more: boolean } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [typing, setTyping] = useState<Map<string, number>>(new Map());
  const [showPeople, setShowPeople] = useState(false);
  const [muted, setMuted] = useState(channel.muted);
  const [editing, setEditing] = useState<string | null>(null);
  const listRef = useRef<HTMLOListElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const atBottom = useRef(true);
  const typingChannel = useRef<ReturnType<ReturnType<typeof createClient>["channel"]> | null>(null);

  const load = useCallback(
    () =>
      loadConversation({ orgSlug, channelId: channel.id }).then((result) => {
        if (result.ok) {
          setData(result);
          setError(null);
        } else setError(result.error);
      }),
    [orgSlug, channel.id],
  );

  // load on open and whenever there's news; opening marks it read, so the list refreshes after
  const changed = useRef(onChanged);
  useEffect(() => {
    changed.current = onChanged;
  });
  useEffect(() => {
    void load().then(() => changed.current());
  }, [load, version]);

  useEffect(() => {
    wrapRef.current?.querySelector<HTMLElement>("[data-autofocus]")?.focus();
  }, []);

  // keep the newest message in view, unless they've scrolled up to read
  useEffect(() => {
    const el = listRef.current?.parentElement;
    if (el && atBottom.current) el.scrollTop = el.scrollHeight;
  }, [data]);

  useBroadcast([`chat:${channel.id}:messages`], () => void load());

  // typing: a broadcast on the conversation's own private topic
  useEffect(() => {
    const supabase = createClient();
    const ch = supabase.channel(`chat:${channel.id}:typing`, { config: { private: true } });
    ch.on("broadcast", { event: "typing" }, ({ payload }) => {
      const who = (payload as { userId?: string }).userId;
      if (!who || who === me) return;
      setTyping((prev) => new Map(prev).set(who, Date.now()));
    });
    void (async () => {
      await supabase.realtime.setAuth();
      ch.subscribe();
    })();
    typingChannel.current = ch;
    const sweep = window.setInterval(() => {
      setTyping((prev) => {
        const now = Date.now();
        const next = new Map([...prev].filter(([, at]) => now - at < TYPING_CLEARS_MS));
        return next.size === prev.size ? prev : next;
      });
    }, 1000);
    return () => {
      window.clearInterval(sweep);
      typingChannel.current = null;
      void supabase.removeChannel(ch);
    };
  }, [channel.id, me]);

  const lastTyped = useRef(0);
  const announceTyping = () => {
    const now = Date.now();
    if (now - lastTyped.current < 2000) return;
    lastTyped.current = now;
    void typingChannel.current?.send({ type: "broadcast", event: "typing", payload: { userId: me } });
  };

  const typers = [...typing.keys()].map((id) => people[id]?.name.split(" ")[0] ?? "Someone");
  const typingText =
    typers.length === 0 ? "" : typers.length === 1 ? `${typers[0]} is typing…` : `${typers.slice(0, -1).join(", ")} and ${typers.at(-1)} are typing…`;

  const mentionable = (data?.mentionable ?? []).map((id) => people[id]).filter((p): p is ChatPerson => Boolean(p));

  const [muting, startMuting] = useTransition();
  // shows "Muted" only once it's saved
  const toggleMute = () =>
    startMuting(async () => {
      const result = await setChannelMuted({ orgSlug, channelId: channel.id, muted: !muted });
      if (result.ok) {
        setMuted(!muted);
        onChanged();
      }
    });

  const nameOf = (id: string) => people[id]?.name;

  return (
    <div ref={wrapRef} className="flex min-h-0 flex-1 flex-col">
      <PanelHeader
        headingId={headingId}
        onBack={onBack}
        onClose={onClose}
        title={
          <span className="flex items-center gap-2">
            {channel.kind === "direct" ? null : <span aria-hidden>#</span>}
            <span className="truncate">{channel.title}</span>
            {channel.kind === "direct" ? <PresenceBadge userId={channel.otherUserId} /> : null}
          </span>
        }
      >
        {channel.kind !== "direct" ? (
          <button
            type="button"
            aria-label="People here"
            aria-expanded={showPeople}
            onClick={() => setShowPeople((v) => !v)}
            className="inline-flex size-8 items-center justify-center rounded hover:bg-panel"
          >
            <Users aria-hidden className="size-4" />
          </button>
        ) : null}
        <button
          type="button"
          aria-pressed={muted}
          aria-busy={muting}
          disabled={muting}
          onClick={toggleMute}
          className="inline-flex items-center gap-1 rounded border border-rule px-2 py-1 font-heading text-xs font-semibold hover:bg-panel"
        >
          {muted ? <BellOff aria-hidden className="size-3.5" /> : <Bell aria-hidden className="size-3.5" />}
          {muted ? "Muted" : "Mute"}
        </button>
      </PanelHeader>

      {showPeople ? (
        <section aria-label="People here" className="max-h-48 overflow-y-auto border-b border-rule px-4 py-2">
          <ul className="flex flex-col gap-1">
            {[me, ...(data?.mentionable ?? [])].map((id) =>
              people[id] ? (
                <li key={id} className="flex items-center gap-2 text-sm">
                  <Avatar name={people[id]!.name} initials={people[id]!.initials} photoUrl={people[id]!.photoUrl} size="xs" />
                  <Link href={people[id]!.href} className="min-w-0 flex-1 truncate hover:underline">
                    {people[id]!.name}
                    {id === me ? " (you)" : ""}
                  </Link>
                  <PresenceBadge userId={id} />
                </li>
              ) : null,
            )}
          </ul>
        </section>
      ) : null}

      <div
        className="min-h-0 flex-1 overflow-y-auto px-4 py-3"
        onScroll={(e) => {
          const el = e.currentTarget;
          atBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 40;
        }}
      >
        {error ? <p className="text-sm text-bad-ink">{error}</p> : null}
        {data === null && !error ? <p className="text-sm text-ink-muted">Loading…</p> : null}
        {data ? (
          <>
            <p className="pb-3 text-center text-xs text-ink-muted">
              {data.more
                ? "Showing the latest 100 messages."
                : channel.kind === "project"
                  ? "This is where your history here starts."
                  : "This is the start of the conversation."}
            </p>
            <div role="log" aria-live="polite" aria-label={`Messages in ${channel.title}`}>
            {data.messages.length === 0 ? <p className="text-sm text-ink-muted">No messages yet. Say hello.</p> : null}
            <ol ref={listRef} className="flex flex-col gap-3">
              {data.messages.map((m) => {
                const sender = m.senderId ? people[m.senderId] : undefined;
                const name = sender?.name ?? "Someone who left";
                const mine = m.senderId === me;
                return (
                  <li key={m.id} className="group flex gap-2.5" data-message={m.id}>
                    <Avatar name={name} initials={sender?.initials ?? "?"} photoUrl={sender?.photoUrl ?? null} size="sm" />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-baseline gap-2">
                        {sender ? (
                          <Link href={sender.href} className="truncate font-heading text-sm font-bold hover:underline">
                            {name}
                          </Link>
                        ) : (
                          <span className="truncate font-heading text-sm font-bold">{name}</span>
                        )}
                        <time dateTime={m.createdAt} title={m.fullTime} className="ml-auto shrink-0 text-xs text-ink-muted tabular-nums">
                          {m.time}
                        </time>
                      </div>
                      {m.deleted ? (
                        <p className="text-sm text-ink-muted italic">message deleted</p>
                      ) : editing === m.id ? (
                        <Composer
                          mentionable={mentionable}
                          initial={fromTokens(m.body, nameOf)}
                          label="Edit your message"
                          submitLabel="Save"
                          onCancel={() => setEditing(null)}
                          onSubmit={async (text) => {
                            const result = await editMessage({ messageId: m.id, body: text });
                            if (result.ok) {
                              setEditing(null);
                              void load();
                            }
                            return result;
                          }}
                        />
                      ) : (
                        <>
                          <MessageBody body={m.body} people={people} />
                          {m.edited ? <span className="text-xs text-ink-muted">(edited)</span> : null}
                        </>
                      )}
                      {mine && !m.deleted && editing !== m.id ? (
                        <div className="mt-0.5 flex gap-1 opacity-0 group-focus-within:opacity-100 group-hover:opacity-100 focus-within:opacity-100">
                          <button
                            type="button"
                            onClick={() => setEditing(m.id)}
                            className="inline-flex items-center gap-1 rounded px-1 text-xs text-ink-muted hover:text-ink"
                          >
                            <Pencil aria-hidden className="size-3" />
                            Edit<span className="sr-only"> your message from {m.time}</span>
                          </button>
                          <button
                            type="button"
                            onClick={async () => {
                              if (!window.confirm("Delete this message? Others will see “message deleted”.")) return;
                              const result = await deleteMessage({ messageId: m.id });
                              if (result.ok) void load();
                            }}
                            className="inline-flex items-center gap-1 rounded px-1 text-xs text-ink-muted hover:text-bad-ink"
                          >
                            <Trash2 aria-hidden className="size-3" />
                            Delete<span className="sr-only"> your message from {m.time}</span>
                          </button>
                        </div>
                      ) : null}
                    </div>
                  </li>
                );
              })}
            </ol>
            </div>
          </>
        ) : null}
      </div>

      <p aria-live="polite" className="min-h-5 px-4 text-xs text-ink-muted italic" data-typing>
        {typingText}
      </p>
      <div className="border-t border-rule px-3 py-2.5">
        <Composer
          mentionable={mentionable}
          label={`Message ${channel.kind === "direct" ? channel.title : `#${channel.title}`}`}
          submitLabel="Send"
          onTyping={announceTyping}
          onSubmit={async (text) => {
            atBottom.current = true;
            const result = await sendMessage({ orgSlug, channelId: channel.id, body: text });
            if (result.ok) void load();
            return result;
          }}
        />
      </div>
    </div>
  );
}

/** A text box with an @mention picker. Enter sends; Shift+Enter starts a new line. */
export function Composer({
  mentionable,
  label,
  submitLabel,
  initial,
  onSubmit,
  onCancel,
  onTyping,
  rows = 2,
}: {
  mentionable: ChatPerson[];
  label: string;
  submitLabel: string;
  initial?: { text: string; picked: Picked[] };
  onSubmit: (tokens: string) => Promise<{ ok: true } | { ok: false; error: string }>;
  onCancel?: () => void;
  onTyping?: () => void;
  rows?: number;
}) {
  const [text, setText] = useState(initial?.text ?? "");
  const [picked, setPicked] = useState<Picked[]>(initial?.picked ?? []);
  const [mention, setMention] = useState<{ start: number; query: string } | null>(null);
  const [active, setActive] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const ref = useRef<HTMLTextAreaElement>(null);
  const listId = useId();
  const inputId = useId();

  const matches = useMemo(
    () =>
      mention
        ? mentionable.filter((p) => p.name.toLowerCase().includes(mention.query.toLowerCase())).slice(0, 6)
        : [],
    [mention, mentionable],
  );

  const pick = (p: ChatPerson) => {
    if (!mention) return;
    const caret = ref.current?.selectionStart ?? text.length;
    const next = `${text.slice(0, mention.start)}@${p.name} ${text.slice(caret)}`;
    setText(next);
    setPicked((list) => (list.some((x) => x.userId === p.userId) ? list : [...list, { userId: p.userId, name: p.name }]));
    setMention(null);
    requestAnimationFrame(() => {
      const at = mention.start + p.name.length + 2;
      ref.current?.focus();
      ref.current?.setSelectionRange(at, at);
    });
  };

  const submit = () => {
    const trimmed = text.trim();
    if (!trimmed || pending) return;
    if (trimmed.length > MAX_MESSAGE_LENGTH) {
      setError(`Keep it under ${MAX_MESSAGE_LENGTH} characters.`);
      return;
    }
    start(async () => {
      const result = await onSubmit(toTokens(trimmed, picked));
      if (result.ok) {
        setText("");
        setPicked([]);
        setError(null);
      } else setError(result.error);
    });
  };

  const open = mention !== null && matches.length > 0;

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
      className="relative flex flex-col gap-1.5"
    >
      {open ? (
        <ul id={listId} role="listbox" aria-label="People to mention" className="absolute bottom-full left-0 z-10 mb-1 w-64 rounded-md border border-rule bg-canvas py-1">
          {matches.map((p, i) => (
            <li
              key={p.userId}
              id={`${listId}-${i}`}
              role="option"
              aria-selected={i === active}
              onMouseDown={(e) => {
                e.preventDefault();
                pick(p);
              }}
              className={`flex cursor-pointer items-center gap-2 px-2.5 py-1.5 text-sm ${i === active ? "bg-accent-tint" : ""}`}
            >
              <Avatar name={p.name} initials={p.initials} photoUrl={p.photoUrl} size="xs" />
              <span className="min-w-0 flex-1 truncate">{p.name}</span>
              <PresenceBadge userId={p.userId} compact />
            </li>
          ))}
        </ul>
      ) : null}
      <label htmlFor={inputId} className="sr-only">
        {label}
      </label>
      <div className="flex items-end gap-2">
        <textarea
          id={inputId}
          ref={ref}
          rows={rows}
          value={text}
          placeholder={`${label}… (@ to mention)`}
          role="combobox"
          aria-expanded={open}
          aria-controls={open ? listId : undefined}
          aria-autocomplete="list"
          aria-activedescendant={open ? `${listId}-${active}` : undefined}
          onChange={(e) => {
            setText(e.target.value);
            setMention(mentionAt(e.target.value, e.target.selectionStart));
            setActive(0);
            onTyping?.();
          }}
          onKeyDown={(e) => {
            if (open) {
              if (e.key === "ArrowDown") {
                e.preventDefault();
                setActive((i) => (i + 1) % matches.length);
                return;
              }
              if (e.key === "ArrowUp") {
                e.preventDefault();
                setActive((i) => (i - 1 + matches.length) % matches.length);
                return;
              }
              if (e.key === "Enter" || e.key === "Tab") {
                e.preventDefault();
                pick(matches[active]!);
                return;
              }
              if (e.key === "Escape") {
                e.preventDefault();
                e.stopPropagation();
                setMention(null);
                return;
              }
            }
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              submit();
            }
            if (e.key === "Escape" && onCancel) {
              e.preventDefault();
              onCancel();
            }
          }}
          className="min-h-10 w-full resize-y rounded-md border border-rule bg-canvas px-2.5 py-2 text-sm"
        />
        <button
          type="submit"
          disabled={pending || !text.trim()}
          className="inline-flex shrink-0 items-center gap-1 rounded-md bg-accent px-3 py-2 font-heading text-sm font-semibold text-on-accent disabled:opacity-50"
        >
          <Send aria-hidden className="size-4" />
          {submitLabel}
        </button>
      </div>
      {onCancel ? (
        <button type="button" onClick={onCancel} className="self-start text-xs text-ink-muted hover:underline">
          Cancel
        </button>
      ) : null}
      {error ? (
        <p role="alert" className="text-xs text-bad-ink">
          {error}
        </p>
      ) : null}
    </form>
  );
}
