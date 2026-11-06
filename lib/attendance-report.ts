// Attendance arithmetic, shared by the Reports view, its chart and the CSV
// export. Pure, so it is unit-tested.
//
// Attendance rate = (present + late) / (present + late + absent). Excused
// absences don't count against anyone, so they're left out of both sides.

export type MarkStatus = "present" | "late" | "absent" | "excused";

export type Tally = { present: number; late: number; absent: number; excused: number; total: number };

export type ReportRow = { key: string; name: string; tally: Tally; rate: number | null };

export function emptyTally(): Tally {
  return { present: 0, late: 0, absent: 0, excused: 0, total: 0 };
}

export function addMark(tally: Tally, status: MarkStatus): Tally {
  tally[status] += 1;
  tally.total += 1;
  return tally;
}

export function attendanceRate(t: Tally): number | null {
  const counted = t.present + t.late + t.absent;
  return counted === 0 ? null : (t.present + t.late) / counted;
}

/** "83%", or a dash when nothing counts yet. */
export function formatRate(rate: number | null): string {
  return rate === null ? "—" : `${Math.round(rate * 100)}%`;
}

/**
 * Groups marks by a key (participant or program), naming each group. Marks
 * whose key is null (a participant deleted for privacy) are grouped under
 * `nullName`.
 */
export function groupMarks<M extends { status: MarkStatus }>(
  marks: M[],
  keyOf: (m: M) => string | null,
  nameOf: (key: string) => string,
  nullName: string,
): ReportRow[] {
  const groups = new Map<string, Tally>();
  for (const m of marks) {
    const key = keyOf(m) ?? "";
    groups.set(key, addMark(groups.get(key) ?? emptyTally(), m.status));
  }
  return [...groups.entries()]
    .map(([key, tally]) => ({ key, name: key ? nameOf(key) : nullName, tally, rate: attendanceRate(tally) }))
    .sort((a, b) => (a.key === "") !== (b.key === "") ? (a.key === "" ? 1 : -1) : a.name.localeCompare(b.name));
}

/** One CSV field, quoted when it needs to be, and safe to open in a spreadsheet. */
export function csvField(value: string | number | null): string {
  let text = value === null ? "" : String(value);
  // a leading =, +, - or @ would run as a formula in a spreadsheet; plain
  // numbers and amounts (like -12.50 or -$1,200.00) are left as they are
  const plainNumber = typeof value === "number" || /^[+-]?[$€£¥]?\d[\d,]*(\.\d+)?%?$/.test(text);
  if (!plainNumber && /^[=+\-@\t\r]/.test(text)) text = `'${text}`;
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export function toCsv(rows: (string | number | null)[][]): string {
  return rows.map((r) => r.map(csvField).join(",")).join("\r\n") + "\r\n";
}
