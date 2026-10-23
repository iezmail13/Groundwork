"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Pencil, Trash2 } from "lucide-react";
import { Avatar } from "@/components/people/avatar";
import { Composer, MessageBody } from "@/components/chat/chat";
import { fromTokens } from "@/lib/chat-text";
import type { ChatPerson } from "@/lib/chat";
import type { CommentItem } from "@/lib/comments";
import { addComment, deleteComment, editComment } from "@/app/[orgSlug]/comments/actions";

/**
 * A thread of comments (on work) or replies (in a discussion), D106. Each
 * shows the author's photo or initials, name, text and a timestamp on the
 * side; authors edit ("(edited)") or delete ("… deleted") their own.
 */
export function CommentThread({
  orgSlug,
  kind,
  targetId,
  items,
  people,
  me,
  mentionable,
  noun,
  emptyText,
  canPost = true,
}: {
  orgSlug: string;
  kind: "task" | "discussion";
  targetId: string;
  items: CommentItem[];
  people: Record<string, ChatPerson>;
  me: string;
  mentionable: string[];
  /** "comment" or "reply" */
  noun: string;
  emptyText: string;
  canPost?: boolean;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState<string | null>(null);
  const pickable = mentionable.map((id) => people[id]).filter((p): p is ChatPerson => Boolean(p));
  const nameOf = (id: string) => people[id]?.name;

  return (
    <div className="flex flex-col gap-4">
      {items.length === 0 ? <p className="text-sm text-ink-muted">{emptyText}</p> : null}
      <ol className="flex flex-col divide-y divide-rule border-y border-rule" aria-label={`${noun[0]!.toUpperCase()}${noun.slice(1)}s`}>
        {items.map((c) => {
          const author = c.authorId ? people[c.authorId] : undefined;
          const name = author?.name ?? "Someone who left";
          const mine = c.authorId === me;
          return (
            <li key={c.id} className="group flex gap-3 py-3" data-comment={c.id}>
              <Avatar name={name} initials={author?.initials ?? "?"} photoUrl={author?.photoUrl ?? null} size="sm" />
              <div className="min-w-0 flex-1">
                <div className="flex items-baseline gap-2">
                  {author ? (
                    <Link href={author.href} className="font-heading text-sm font-bold hover:underline">
                      {name}
                    </Link>
                  ) : (
                    <span className="font-heading text-sm font-bold">{name}</span>
                  )}
                  <time dateTime={c.createdAt} title={c.fullTime} className="ml-auto shrink-0 text-xs text-ink-muted tabular-nums">
                    {c.time}
                  </time>
                </div>
                {c.deleted ? (
                  <p className="text-sm text-ink-muted italic">{noun} deleted</p>
                ) : editing === c.id ? (
                  <Composer
                    mentionable={pickable}
                    initial={fromTokens(c.body, nameOf)}
                    label={`Edit your ${noun}`}
                    submitLabel="Save"
                    onCancel={() => setEditing(null)}
                    onSubmit={async (text) => {
                      const result = await editComment({ kind, commentId: c.id, body: text });
                      if (result.ok) {
                        setEditing(null);
                        router.refresh();
                      }
                      return result;
                    }}
                  />
                ) : (
                  <>
                    <MessageBody body={c.body} people={people} />
                    {c.edited ? <span className="text-xs text-ink-muted">(edited)</span> : null}
                  </>
                )}
                {mine && !c.deleted && editing !== c.id ? (
                  <div className="mt-1 flex gap-2">
                    <button type="button" onClick={() => setEditing(c.id)} className="inline-flex items-center gap-1 text-xs text-ink-muted hover:text-ink">
                      <Pencil aria-hidden className="size-3" />
                      Edit<span className="sr-only"> your {noun} from {c.time}</span>
                    </button>
                    <button
                      type="button"
                      onClick={async () => {
                        if (!window.confirm(`Delete this ${noun}? Others will see “${noun} deleted”.`)) return;
                        const result = await deleteComment({ kind, commentId: c.id });
                        if (result.ok) router.refresh();
                      }}
                      className="inline-flex items-center gap-1 text-xs text-ink-muted hover:text-bad-ink"
                    >
                      <Trash2 aria-hidden className="size-3" />
                      Delete<span className="sr-only"> your {noun} from {c.time}</span>
                    </button>
                  </div>
                ) : null}
              </div>
            </li>
          );
        })}
      </ol>
      {canPost ? (
        <Composer
          mentionable={pickable}
          label={`Add a ${noun}`}
          submitLabel="Post"
          rows={3}
          onSubmit={async (text) => {
            const result = await addComment({ orgSlug, kind, targetId, body: text });
            if (result.ok) router.refresh();
            return result;
          }}
        />
      ) : null}
    </div>
  );
}
