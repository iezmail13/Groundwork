import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { PiggyBank } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { EmptyState } from "@/components/ui/empty-state";
import { FundButton } from "@/components/funds/fund-forms";
import { SplitBar } from "@/components/funds/split-bar";
import { getOrgContext } from "@/lib/org";
import { allocatedCents, getFunds } from "@/lib/funds";
import { getProjectOptions } from "@/lib/queries";
import { canManageOrg } from "@/lib/roles";
import { formatMoney, formatShare } from "@/lib/money";
import { lower } from "@/lib/terminology/t";

export async function generateMetadata({ params }: PageProps<"/[orgSlug]/funds">): Promise<Metadata> {
  const { t } = await getOrgContext((await params).orgSlug);
  return { title: t("section.funds") };
}

export default async function FundsPage({ params }: PageProps<"/[orgSlug]/funds">) {
  const { orgSlug } = await params;
  const ctx = await getOrgContext(orgSlug);
  // owners and managers only (RLS returns nothing to anyone else)
  if (!canManageOrg(ctx.role)) notFound();
  const { t, org, base } = ctx;
  const [funds, projects] = await Promise.all([getFunds(org.id), getProjectOptions(org.id)]);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={t("section.funds")}
        description={`Where each fund's money goes. Only ${lower(t("role.owner", "other"))} and ${lower(t("role.manager", "other"))} see this.`}
        actions={<FundButton organizationId={org.id} orgSlug={org.slug} projects={projects} />}
      />
      {funds.length === 0 ? (
        <EmptyState icon={<PiggyBank aria-hidden />} title="No funds yet">
          Add a grant, donation drive or budget with its total, then split it into the parts it pays for. Link a fund, or any part
          of it, to the {lower(t("project"))} it supports.
        </EmptyState>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] border-collapse text-left">
            <caption className="sr-only">Funds and how much of each is allocated</caption>
            <thead>
              <tr className="border-b border-ink font-heading text-sm">
                <th scope="col" className="py-2 pr-4 font-semibold">Fund</th>
                <th scope="col" className="py-2 pr-4 font-semibold">{t("project")}</th>
                <th scope="col" className="py-2 pr-4 text-right font-semibold">Total</th>
                <th scope="col" className="py-2 pr-4 text-right font-semibold">Allocated</th>
                <th scope="col" className="py-2 pr-4 text-right font-semibold">Left</th>
                <th scope="col" className="w-1/4 py-2 font-semibold">Split</th>
              </tr>
            </thead>
            <tbody>
              {funds.map((f) => {
                const allocated = allocatedCents(f);
                return (
                  <tr key={f.id} className="border-b border-rule">
                    <th scope="row" className="py-3 pr-4">
                      <Link href={`${base}/funds/${f.id}`} className="font-semibold hover:underline">
                        {f.name}
                      </Link>
                      <span className="block text-sm font-normal text-ink-muted">
                        {f.allocations.length} {f.allocations.length === 1 ? "part" : "parts"}
                      </span>
                    </th>
                    <td className="py-3 pr-4 text-sm">
                      {f.project ? (
                        <Link href={`${base}/projects/${f.project.id}`} className="hover:underline">
                          {f.project.name}
                        </Link>
                      ) : (
                        <span className="text-ink-muted">—</span>
                      )}
                    </td>
                    <td className="py-3 pr-4 text-right tabular-nums">{formatMoney(f.total_cents, f.currency)}</td>
                    <td className="py-3 pr-4 text-right tabular-nums">
                      {formatMoney(allocated, f.currency)}
                      <span className="block text-sm font-heading font-bold">{formatShare(allocated, f.total_cents)}</span>
                    </td>
                    <td className="py-3 pr-4 text-right tabular-nums">{formatMoney(f.total_cents - allocated, f.currency)}</td>
                    <td className="py-3">
                      <SplitBar
                        size="sm"
                        legend={false}
                        caption={f.name}
                        currency={f.currency}
                        totalCents={f.total_cents}
                        parts={f.allocations.map((a) => ({ key: a.id, label: a.label, cents: a.amount_cents }))}
                      />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
