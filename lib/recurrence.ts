import { addDays } from "@/lib/dates";

// Repeating events (D112): "every Friday for 5 weeks", or several weekdays.

export const MAX_REPEAT_WEEKS = 52;
export const MAX_OCCURRENCES = 200;

/** 0 = Sunday … 6 = Saturday, for an ISO date (read as a calendar date, no time zone). */
export function weekdayOf(date: string): number {
  return new Date(`${date}T12:00:00Z`).getUTCDay();
}

/**
 * The dates on the chosen weekdays within `weeks` weeks from `start`, the start
 * date included when it falls on one of them. "Every Friday for 5 weeks" from a
 * Friday is 5 Fridays.
 */
export function weeklyDates(start: string, weekdays: number[], weeks: number): string[] {
  const days = new Set(weekdays.filter((d) => Number.isInteger(d) && d >= 0 && d <= 6));
  const out: string[] = [];
  for (let i = 0; i < weeks * 7 && out.length < MAX_OCCURRENCES; i++) {
    const date = addDays(start, i);
    if (days.has(weekdayOf(date))) out.push(date);
  }
  return out;
}

export const WEEKDAYS = [
  { value: 1, short: "Mon", long: "Monday" },
  { value: 2, short: "Tue", long: "Tuesday" },
  { value: 3, short: "Wed", long: "Wednesday" },
  { value: 4, short: "Thu", long: "Thursday" },
  { value: 5, short: "Fri", long: "Friday" },
  { value: 6, short: "Sat", long: "Saturday" },
  { value: 0, short: "Sun", long: "Sunday" },
] as const;
