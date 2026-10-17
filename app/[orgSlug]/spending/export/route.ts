import { NextResponse, type NextRequest } from "next/server";
import { getOrgContext } from "@/lib/org";
import { canManageOrg } from "@/lib/roles";
import { getMembers } from "@/lib/org";
import { getSpending } from "@/lib/spending";
import { toCsv } from "@/lib/attendance-report";
import { addDays, isIsoDate } from "@/lib/dates";
import { centsToInput } from "@/lib/money";

/**
 * Approved spending for one fund and date range, as CSV (D108). Owners and
 * managers only; cells are formula-safe, like the attendance export.
 */
export async function GET(request: NextRequest, route: RouteContext<"/[orgSlug]/spending/export">) {
  const { orgSlug } = await route.params;
  const ctx = await getOrgContext(orgSlug);
  if (!canManageOrg(ctx.role)) return new NextResponse("Not found", { status: 404 });
  const sp = request.nextUrl.searchParams;
  const fundId = sp.get("fund") ?? "";
  if (!/^[0-9a-f-]{36}$/.test(fundId)) return new NextResponse("Pick a fund", { status: 400 });
  const from = isIsoDate(sp.get("from") ?? "") ? sp.get("from")! : addDays(ctx.today, -89);
  const to = isIsoDate(sp.get("to") ?? "") && sp.get("to")! >= from ? sp.get("to")! : ctx.today;
  const [entries, members] = await Promise.all([getSpending(ctx, { fundId, status: "approved", from, to, limit: 10000 }), getMembers(ctx.org.id)]);
  const nameOf = new Map(members.map((m) => [m.userId, m.name]));
  const fundName = entries[0]?.fundName ?? "fund";
  const rows: (string | number | null)[][] = [
    ["Date", "Category", ctx.t("project"), "Amount", "Currency", "Note", "Submitted by", "Approved by", "Approved on", "Receipt"],
    ...entries
      .sort((a, b) => a.spentOn.localeCompare(b.spentOn))
      .map((e) => [
        e.spentOn,
        e.category,
        e.projectName ?? "",
        centsToInput(e.amountCents),
        e.currency,
        e.note,
        nameOf.get(e.submittedBy ?? "") ?? "Someone who left",
        nameOf.get(e.decidedBy ?? "") ?? "Someone who left",
        e.decidedAt?.slice(0, 10) ?? "",
        e.hasReceipt ? "Yes" : "No",
      ]),
    [],
    ["Total", "", "", centsToInput(entries.reduce((s, e) => s + e.amountCents, 0)), entries[0]?.currency ?? "", "", "", "", "", ""],
  ];
  const file = `${fundName.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-spending-${from}-to-${to}.csv`;
  return new NextResponse(toCsv(rows), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${file}"`,
      "Cache-Control": "private, no-store",
    },
  });
}
