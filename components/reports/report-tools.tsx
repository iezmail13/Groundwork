"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Copy, Download, Link2, Printer } from "lucide-react";
import { createShareLink, recordPrint, revokeShareLink } from "@/app/[orgSlug]/reports/actions";

type Params = { orgSlug: string; template: string; projectId: string; from: string; to: string };

/** Print or save as PDF, and download CSV (D109). */
export function ReportExports({ params, csvHref }: { params: Params; csvHref: string }) {
  return (
    <div className="flex flex-wrap items-center gap-2 print:hidden">
      <button
        type="button"
        onClick={() => {
          void recordPrint({ orgSlug: params.orgSlug, template: params.template, from: params.from, to: params.to });
          window.print();
        }}
        className="inline-flex items-center gap-1.5 rounded-md border border-rule px-3 py-2 font-heading text-sm font-semibold hover:bg-panel"
      >
        <Printer aria-hidden className="size-4" />
        Print or save as PDF
      </button>
      <a href={csvHref} className="inline-flex items-center gap-1.5 rounded-md border border-rule px-3 py-2 font-heading text-sm font-semibold hover:bg-panel">
        <Download aria-hidden className="size-4" />
        Download CSV
      </a>
      <p className="w-full text-xs text-ink-muted">PDFs come from your browser: choose &quot;Save as PDF&quot; in the print dialog.</p>
    </div>
  );
}

/** Sharing a read-only snapshot by link, for a set time (D109). */
export function SharePanel({
  params,
  links,
}: {
  params: Params;
  links: { id: string; title: string; createdAt: string; expiresAt: string; revoked: boolean; mine: boolean; by: string }[];
}) {
  const router = useRouter();
  const [days, setDays] = useState<7 | 30 | 90>(30);
  const [result, setResult] = useState<{ url?: string; error?: string } | null>(null);
  const [copied, setCopied] = useState(false);
  const [pending, start] = useTransition();

  const create = () =>
    start(async () => {
      setCopied(false);
      const res = await createShareLink({ ...params, days });
      setResult(res.ok ? { url: res.url } : { error: res.message });
      if (res.ok) router.refresh();
    });

  const now = new Date().toISOString();
  return (
    <section aria-labelledby="share-heading" className="flex flex-col gap-3 rounded-lg border border-rule p-4 print:hidden">
      <h2 id="share-heading" className="flex items-center gap-2 font-heading text-lg font-bold">
        <Link2 aria-hidden className="size-5" />
        Share this report
      </h2>
      <p className="text-sm text-ink-muted">
        Anyone with the link sees this report as it is now, read-only, until the link expires or you revoke it. Nothing else in Groundwork is
        reachable through it.
      </p>
      <div className="flex flex-wrap items-end gap-2">
        <label className="flex flex-col gap-1 text-sm font-semibold">
          Link lasts
          <select value={days} onChange={(e) => setDays(Number(e.target.value) as 7 | 30 | 90)} className="rounded-md border border-rule bg-canvas px-3 py-2">
            <option value={7}>7 days</option>
            <option value={30}>30 days</option>
            <option value={90}>90 days</option>
          </select>
        </label>
        <button
          type="button"
          disabled={pending}
          onClick={create}
          className="rounded-md bg-accent px-4 py-2 font-heading text-sm font-semibold text-on-accent disabled:opacity-60"
        >
          {pending ? "Creating…" : "Create share link"}
        </button>
      </div>
      {result?.error ? (
        <p role="alert" className="text-sm font-semibold text-bad-ink">
          {result.error}
        </p>
      ) : null}
      {result?.url ? (
        <div className="flex flex-col gap-1.5" role="status">
          <label htmlFor="share-url" className="text-sm font-semibold">
            Your link (shown once: copy it now)
          </label>
          <div className="flex flex-wrap gap-2">
            <input id="share-url" readOnly value={result.url} onFocus={(e) => e.currentTarget.select()} className="min-w-0 flex-1 rounded-md border border-rule bg-panel px-3 py-2 text-sm" />
            <button
              type="button"
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(result.url!);
                  setCopied(true);
                } catch {
                  setCopied(false);
                }
              }}
              className="inline-flex items-center gap-1.5 rounded-md border border-rule px-3 py-2 font-heading text-sm font-semibold hover:bg-panel"
            >
              <Copy aria-hidden className="size-4" />
              {copied ? "Copied" : "Copy"}
            </button>
          </div>
        </div>
      ) : null}
      {links.length ? (
        <table className="w-full text-left text-sm">
          <caption className="sr-only">Share links, newest first</caption>
          <thead>
            <tr className="border-b border-ink font-heading">
              <th scope="col" className="py-2 pr-3">Report</th>
              <th scope="col" className="py-2 pr-3">Shared by</th>
              <th scope="col" className="py-2 pr-3">Expires</th>
              <th scope="col" className="py-2">
                <span className="sr-only">Actions</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {links.map((l) => {
              const live = !l.revoked && l.expiresAt > now;
              return (
                <tr key={l.id} className="border-b border-rule">
                  <th scope="row" className="py-2 pr-3 text-left font-normal">
                    {l.title}
                  </th>
                  <td className="py-2 pr-3">{l.mine ? "You" : l.by}</td>
                  <td className="py-2 pr-3 whitespace-nowrap">{l.revoked ? "Revoked" : live ? l.expiresAt.slice(0, 10) : "Expired"}</td>
                  <td className="py-2">
                    {live ? (
                      <button
                        type="button"
                        onClick={() =>
                          start(async () => {
                            if ((await revokeShareLink({ orgSlug: params.orgSlug, shareId: l.id })).ok) router.refresh();
                          })
                        }
                        className="text-sm font-semibold text-bad-ink hover:underline"
                        aria-label={`Revoke the link for ${l.title}`}
                      >
                        Revoke
                      </button>
                    ) : null}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      ) : null}
    </section>
  );
}
