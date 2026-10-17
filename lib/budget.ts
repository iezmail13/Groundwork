// Budget against actual (D108). Status colours are fixed (D83): green on
// pace, amber near the limit or the deadline, red over budget or with
// time-limited money at risk of going unspent. Every status also has a
// word and an icon, so colour is never the only signal.

export type BudgetStatus = "on_pace" | "near_limit" | "deadline_soon" | "over" | "at_risk";

export const BUDGET_LABEL: Record<BudgetStatus, string> = {
  on_pace: "On pace",
  near_limit: "Near the limit",
  deadline_soon: "Deadline soon",
  over: "Over budget",
  at_risk: "At risk of going unspent",
};

export const BUDGET_TONE: Record<BudgetStatus, "good" | "warn" | "bad"> = {
  on_pace: "good",
  near_limit: "warn",
  deadline_soon: "warn",
  over: "bad",
  at_risk: "bad",
};

/** Within this many days of the spend-by date, the deadline counts as close. */
export const DEADLINE_DAYS = 30;
/** At or above this share spent, a budget is near its limit. */
export const NEAR_SHARE = 0.85;
/** Close to the deadline with more than this share left, money is at risk of going unspent. */
export const AT_RISK_SHARE = 0.25;

const dayNumber = (iso: string) => Math.floor(Date.parse(`${iso}T00:00:00Z`) / 86_400_000);

export function budgetStatus({
  totalCents,
  spentCents,
  spendBy,
  today,
}: {
  totalCents: number;
  spentCents: number;
  spendBy: string | null;
  today: string;
}): BudgetStatus {
  if (spentCents > totalCents) return "over";
  const left = totalCents - spentCents;
  const daysLeft = spendBy ? dayNumber(spendBy) - dayNumber(today) : null;
  if (daysLeft !== null && daysLeft <= DEADLINE_DAYS && totalCents > 0 && left / totalCents > AT_RISK_SHARE) return "at_risk";
  if (totalCents > 0 && spentCents / totalCents >= NEAR_SHARE) return "near_limit";
  if (daysLeft !== null && daysLeft <= DEADLINE_DAYS && left > 0) return "deadline_soon";
  return "on_pace";
}

/** The accounting software an owner can link to from Settings → Finance (a plain link, D108). */
export const ACCOUNTING_NAMES = ["QuickBooks", "Xero", "Wave", "Sage", "Other"] as const;
