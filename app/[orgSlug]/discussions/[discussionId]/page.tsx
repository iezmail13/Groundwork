import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { ArrowLeft } from "lucide-react";
import { getOrgContext } from "@/lib/org";
import { getDiscussion } from "@/lib/discussions";
import { getChatPeople } from "@/lib/chat";
import { Avatar } from "@/components/people/avatar";
import { MessageBody } from "@/components/chat/chat";
import { CommentThread } from "@/components/comments/comment-thread";
import { EditDiscussion, RemoveDiscussion } from "@/components/discussions/discussion-forms";

export async function generateMetadata({ params }: PageProps<"/[orgSlug]/discussions/[discussionId]">): Promise<Metadata> {
  const { orgSlug, discussionId } = await params;
  const ctx = await getOrgContext(orgSlug);
  const d = /^[0-9a-f-]{36}$/.test(discussionId) ? await getDiscussion(ctx, discussionId) : null;
  return { title: d?.title ?? "Discussion" };
}

export default async function DiscussionPage({ params }: PageProps<"/[orgSlug]/discussions/[discussionId]">) {
  const { orgSlug, discussionId } = await params;
  if (!/^[0-9a-f-]{36}$/.test(discussionId)) notFound();
  const ctx = await getOrgContext(orgSlug);
  const [d, people] = await Promise.all([getDiscussion(ctx, discussionId), getChatPeople(ctx)]);
  if (!d) notFound();
  const author = d.authorId ? people[d.authorId] : undefined;
  const boardHref = d.projectId ? `${ctx.base}/discussions?board=${d.projectId}` : `${ctx.base}/discussions?board=org`;

  return (
    <div className="flex max-w-3xl flex-col gap-6">
      <Link href={boardHref} className="inline-flex items-center gap-1.5 text-sm font-semibold text-accent hover:underline">
        <ArrowLeft aria-hidden className="size-4" />
        {d.projectName ?? "Everyone"} board
      </Link>
      <article aria-labelledby="discussion-title" className="flex flex-col gap-3 border-b border-ink pb-5">
        <h1 id="discussion-title" className="font-heading text-3xl font-bold">
          {d.title}
        </h1>
        <div className="flex items-center gap-2.5">
          <Avatar name={author?.name ?? "Someone who left"} initials={author?.initials ?? "?"} photoUrl={author?.photoUrl ?? null} size="sm" />
          {author ? (
            <Link href={author.href} className="font-heading text-sm font-bold hover:underline">
              {author.name}
            </Link>
          ) : (
            <span className="font-heading text-sm font-bold">Someone who left</span>
          )}
          <time dateTime={d.createdAt} title={d.fullTime} className="ml-auto text-xs text-ink-muted">
            {d.time}
            {d.edited ? " (edited)" : ""}
          </time>
        </div>
        <MessageBody body={d.body} people={people} />
        {d.authorId === ctx.userId || d.canRemove ? (
          <div className="flex flex-wrap items-start gap-2">
            {d.authorId === ctx.userId ? <EditDiscussion discussionId={d.id} title={d.title} body={d.body} /> : null}
            {d.canRemove ? <RemoveDiscussion orgSlug={ctx.org.slug} discussionId={d.id} /> : null}
          </div>
        ) : null}
      </article>
      <section aria-labelledby="replies-heading" className="flex flex-col gap-3">
        <h2 id="replies-heading" className="font-heading text-lg font-bold">
          Replies <span className="font-normal text-ink-muted">({d.replies.filter((r) => !r.deleted).length})</span>
        </h2>
        <CommentThread
          orgSlug={ctx.org.slug}
          kind="discussion"
          targetId={d.id}
          items={d.replies}
          people={people}
          me={ctx.userId}
          mentionable={d.mentionable}
          noun="reply"
          emptyText="No replies yet."
        />
      </section>
    </div>
  );
}
