import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { ArrowLeft, X } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { buttonClass } from "@/components/ui/button";
import { AddAllocationForm, DeleteFundButton, EditAllocationButton, FundButton } from "@/components/funds/fund-forms";
import { SplitBar } from "@/components/funds/split-bar";
import { getOrgContext } from "@/lib/org";
import { allocatedCents, getFund } from "@/lib/funds";
import { getProjectOptions } from "@/lib/queries";
import { canManageOrg } from "@/lib/roles";
import { formatMoney, formatShare } from "@/lib/money";
import { lower } from "@/lib/terminology/t";
import { deleteAllocation } from "../actions";

const UUID = /^[0-9a-f-]{36}$/i;

async function load(orgSlug: string, fundId: string) {
  const ctx = await getOrgContext(orgSlug);
  if (!canManageOrg(ctx.role) || !UUID.test(fundId)) return { ctx, fund: null };
  return { ctx, fund: await getFund(ctx.org.id, fundId) };
}

export async function generateMetadata({ params }: PageProps<"/[orgSlug]/funds/[fundId]">): Promise<Metadata> {
  const { orgSlug, fundId } = await params;
  const { ctx, fund } = await load(orgSlug, fundId);
  return { title: fund?.name ?? ctx.t("section.funds") };
}

export default async function FundPage({ params }: PageProps<"/[orgSlug]/funds/[fundId]">) {
  const { orgSlug, fundId } = await params;
  const { ctx, fund } = await load(orgSlug, fundId);
  if (!fund) notFound();
  const { t, org, base } = ctx;
  const projects = await getProjectOptions(org.id);
  // a linked project that has since been archived still shows as the current choice
  const projectChoices = [
    ...projects,
    ...[fund.project, ...fund.allocations.map((a) => a.project)].flatMap((p) => (p && !projects.some((x) => x.id === p.id) ? [p] : [])),
  ].filter((p, i, all) => all.findIndex((x) => x.id === p.id) === i);
  const allocated = allocatedCents(fund);
  const left = fund.total_cents - allocated;
  const money = (c: number) => formatMoney(c, fund.currency);

  return (
    <div className="flex flex-col gap-8">
      <Link href={`${base}/funds`} className="inline-flex items-center gap-1.5 text-sm font-semibold text-accent hover:underline">
        <ArrowLeft aria-hidden className="size-4" />
        All funds
      </Link>
      <PageHeader
        title={fund.name}
        description={
          <span className="flex flex-col gap-1">
            <span className="font-heading text-lg font-bold text-ink">
              {money(fund.total_cents)} {fund.currency}
            </span>
            <span>
              {money(allocated)} allocated ({formatShare(allocated, fund.total_cents)}) · {money(left)} left
              {fund.project ? (
                <>
                  {" · for "}
                  <Link href={`${base}/projects/${fund.project.id}`} className="font-semibold hover:underline">
                    {fund.project.name}
                  </Link>
                </>
              ) : null}
            </span>
            {fund.description ? <span className="whitespace-pre-wrap">{fund.description}</span> : null}
          </span>
        }
        actions={
          <>
            <FundButton
              organizationId={org.id}
              orgSlug={org.slug}
              projects={projectChoices}
              fund={{
                id: fund.id,
                name: fund.name,
                description: fund.description,
                total_cents: fund.total_cents,
                currency: fund.currency,
                project_id: fund.project_id,
              }}
            />
            <DeleteFundButton id={fund.id} name={fund.name} orgSlug={org.slug} />
          </>
        }
      />

      <section aria-labelledby="split-heading" className="flex flex-col gap-3">
        <h2 id="split-heading" className="text-xl font-bold">
          How it&apos;s split
        </h2>
        <SplitBar
          caption={`How ${fund.name} is split`}
          currency={fund.currency}
          totalCents={fund.total_cents}
          parts={fund.allocations.map((a) => ({ key: a.id, label: a.label, cents: a.amount_cents, project: a.project?.name ?? null }))}
        />
      </section>

      <section aria-labelledby="parts-heading" className="flex flex-col gap-4">
        <h2 id="parts-heading" className="text-xl font-bold">
          Parts
        </h2>
        {fund.allocations.length ? (
          <ul className="divide-y divide-rule border-y border-rule">
            {fund.allocations.map((a) => (
              <li key={a.id} className="flex flex-wrap items-center gap-x-4 gap-y-1 py-2">
                <span className="min-w-40 flex-1 font-semibold">
                  {a.label}
                  {a.project ? (
                    <Link href={`${base}/projects/${a.project.id}`} className="block text-sm font-normal hover:underline">
                      {a.project.name}
                    </Link>
                  ) : null}
                </span>
                <span className="tabular-nums">{money(a.amount_cents)}</span>
                <span className="w-12 text-right font-heading font-bold tabular-nums">{formatShare(a.amount_cents, fund.total_cents)}</span>
                <span className="flex gap-1">
                  <EditAllocationButton organizationId={org.id} fundId={fund.id} projects={projectChoices} allocation={a} />
                  <form action={deleteAllocation}>
                    <input type="hidden" name="id" value={a.id} />
                    <button type="submit" className={buttonClass("ghost", "sm")} aria-label={`Remove ${a.label}`}>
                      <X aria-hidden className="size-4" />
                      Remove
                    </button>
                  </form>
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-ink-muted">Nothing allocated yet. Add the first part below.</p>
        )}
        <AddAllocationForm
          organizationId={org.id}
          fundId={fund.id}
          projects={projects}
          remainingLabel={left > 0 ? `${money(left)} left to allocate.` : `Fully allocated. Raise the total or reduce a part to add more.`}
        />
        <p className="text-sm text-ink-muted">
          Link a part to a {lower(t("project"))} and it shows on that {lower(t("project"))}&apos;s page.
        </p>
      </section>
    </div>
  );
}
