import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { ReportView } from "@/components/reports/report-view";
import { Brand } from "@/components/logo";
import type { Report } from "@/lib/report-model";

// A shared report (D109): the read-only snapshot its author made, while the
// link is live. Public pages keep Groundwork's own branding (D86).

export const metadata: Metadata = { title: "Shared report", robots: { index: false, follow: false } };

export default async function SharedReportPage({ params }: PageProps<"/r/[token]">) {
  const { token } = await params;
  if (!/^[0-9a-f]{64}$/.test(token)) notFound();
  const supabase = await createClient();
  const { data } = await supabase.rpc("shared_report", { token });
  const share = data?.[0];
  if (!share) notFound();
  const report = share.snapshot as unknown as Report;
  return (
    <div className="min-h-dvh bg-canvas text-ink">
      <header className="border-b border-rule px-4 py-4 sm:px-8 print:hidden">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-4">
          <Link href="/" aria-label="Groundwork home">
            <Brand size={32} />
          </Link>
          <p className="text-sm text-ink-muted">Read-only report · link expires {share.expires_at.slice(0, 10)}</p>
        </div>
      </header>
      <main id="main" className="mx-auto max-w-5xl px-4 py-8 sm:px-8">
        <p className="mb-6 border-l-4 border-ink pl-3 text-sm print:hidden">
          Shared by {share.shared_by} from {share.organization_name}. It shows what they could see when they shared it.
        </p>
        <ReportView report={report} sharedBy={share.shared_by} />
      </main>
    </div>
  );
}
