import Link from "next/link";
import type { Metadata } from "next";
import { MessageSquareText } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { StartDiscussionForm } from "@/components/discussions/discussion-forms";
import { getOrgContext } from "@/lib/org";
import { createClient } from "@/lib/supabase/server";
import { getDiscussions } from "@/lib/discussions";
import { getChatPeople } from "@/lib/chat";
import { lower } from "@/lib/terminology/t";

export const metadata: Metadata = { title: "Discussions" };

/**
 * Discussion boards (D106): the organization's board plus one per program,
 * filtered by where a thread lives. Everyone sees only threads on boards
 * they can see (can_view_discussion).
 */
export default async function DiscussionsPage({ params, searchParams }: PageProps<"/[orgSlug]/discussions">) {
  const { orgSlug } = await params;
  const sp = await searchParams;
  const ctx = await getOrgContext(orgSlug);
  const { t, base, org } = ctx;
  const board = typeof sp.board === "string" ? sp.board : "all";
  const supabase = await createClient();
  const [{ data: projects }, people] = await Promise.all([
    supabase.from("projects").select("id, name").eq("organization_id", org.id).eq("status", "active").order("name"),
    getChatPeople(ctx),
  ]);
  const places = projects ?? [];
  const threads = await getDiscussions(ctx, {
    projectId: board === "org" ? null : board !== "all" && places.some((p) => p.id === board) ? board : undefined,
  });
  const startOpen = sp.new === "1";
  const boards = [{ id: "all", name: "All boards" }, { id: "org", name: "Everyone" }, ...places];

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Discussions"
        description={`Threads for the whole organization and for each ${lower(t("project"))}. Everyone who can see a board can read and reply.`}
      />
      <nav aria-label="Boards" className="flex flex-wrap gap-2">
        {boards.map((b) => (
          <Link
            key={b.id}
            href={b.id === "all" ? `${base}/discussions` : `${base}/discussions?board=${b.id}`}
            aria-current={board === b.id ? "page" : undefined}
            className={`rounded-md border px-3 py-1.5 font-heading text-sm font-semibold ${
              board === b.id ? "border-accent bg-accent text-on-accent" : "border-rule hover:bg-panel"
            }`}
          >
            {b.name}
          </Link>
        ))}
      </nav>

      <details open={startOpen} className="group max-w-2xl rounded-lg border border-rule">
        <summary className="cursor-pointer list-none px-4 py-3 font-heading font-semibold text-accent group-open:border-b group-open:border-rule">
          Start a discussion
        </summary>
        <div className="p-4">
          <StartDiscussionForm
            orgSlug={org.slug}
            places={places}
            initialWhere={board !== "all" && (board === "org" || places.some((p) => p.id === board)) ? board : "org"}
            whereLabel="Where"
          />
        </div>
      </details>

      {threads.length === 0 ? (
        <p className="flex items-center gap-2 text-ink-muted">
          <MessageSquareText aria-hidden className="size-5" />
          No discussions here yet. Start one above.
        </p>
      ) : (
        <table className="w-full text-left">
          <caption className="sr-only">Discussions, latest activity first</caption>
          <thead>
            <tr className="border-b border-ink font-heading text-sm">
              <th scope="col" className="py-2 pr-3">Title</th>
              <th scope="col" className="hidden py-2 pr-3 sm:table-cell">Board</th>
              <th scope="col" className="hidden py-2 pr-3 md:table-cell">Started by</th>
              <th scope="col" className="py-2 pr-3 text-right">Replies</th>
              <th scope="col" className="py-2 text-right">Last activity</th>
            </tr>
          </thead>
          <tbody>
            {threads.map((d) => (
              <tr key={d.id} className="border-b border-rule">
                <td className="py-2.5 pr-3">
                  <Link href={`${base}/discussions/${d.id}`} className="font-semibold hover:underline">
                    {d.title}
                  </Link>
                </td>
                <td className="hidden py-2.5 pr-3 text-sm sm:table-cell">{d.projectName ?? "Everyone"}</td>
                <td className="hidden py-2.5 pr-3 text-sm md:table-cell">{(d.authorId && people[d.authorId]?.name) || "Someone who left"}</td>
                <td className="py-2.5 pr-3 text-right tabular-nums">{d.replies}</td>
                <td className="py-2.5 text-right text-sm tabular-nums">
                  <time dateTime={d.lastActivityAt}>{d.lastActivity}</time>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
